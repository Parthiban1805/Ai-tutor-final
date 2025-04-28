#!/usr/bin/env python
import os
import sys
import json
from typing import List, Dict
import google.generativeai as genai
from langchain_google_genai.embeddings import GoogleGenerativeAIEmbeddings
from langchain_google_genai.llms import GoogleGenerativeAI
from langchain.prompts import PromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain.docstore.document import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma

# ---------------- CLI Arguments ----------------
if len(sys.argv) != 3:
    print(json.dumps({
        "error": "Usage: python ask_question.py <processing_dir> <question>"
    }))
    sys.exit(1)

processing_dir = sys.argv[1]
question = sys.argv[2]

# ---------------- Configuration ----------------
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "AIzaSyCnI1h12n7DxEXXIAKdIp0g6eJEXXehVkc")
TEMPERATURE     = 0.8

# Initialize Google Generative AI
genai.configure(api_key=GOOGLE_API_KEY)
embedding_model = GoogleGenerativeAIEmbeddings(
    model="models/embedding-001",
    google_api_key=GOOGLE_API_KEY
)
llm = GoogleGenerativeAI(
    model="models/gemini-1.5-pro-latest",
    google_api_key=GOOGLE_API_KEY,
    temperature=TEMPERATURE
)

# ---------------- Prompt Templates ----------------
ANALYTICAL_PROMPT = PromptTemplate.from_template(
"""
As an expert academic assistant, analyze the following context and question:

CONTEXT:
{context}

QUESTION: {question}

INSTRUCTIONS:
Provide a clear, direct answer to the question based on the context.
Do not include section headers or metadata in your response.
Focus only on answering the question with relevant information from the context.
"""
)

TABLE_PROMPT = PromptTemplate.from_template(
"""
Analyze the following table data and answer:

TABLE CONTEXT:
{table_context}

QUESTION: {question}

INSTRUCTIONS:
Provide a direct answer based on the table data.
Do not include section headers or analysis notes.
Only include the final answer itself.
"""
)

# ---------------- Helpers ----------------
def load_vectorstore(chroma_dir: str) -> Chroma:
    return Chroma(
        persist_directory=chroma_dir,
        embedding_function=embedding_model
    )

def load_tables(processing_dir: str) -> List[Dict]:
    tables_path = os.path.join(processing_dir, "tables.json")
    try:
        with open(tables_path, 'r') as f:
            return json.load(f)
    except Exception:
        return []

# ---------------- QA Logic ----------------
def route_question(q: str) -> str:
    ql = q.lower()
    if any(w in ql for w in ["how many", "count", "number of", "total"]):
        return "quantitative"
    if any(w in ql for w in ["table", "chart", "figure", "data"]):
        return "table"
    return "general"

# ---------------- Answer Functions ----------------
def answer_general(vectorstore: Chroma, q: str) -> Dict:
    retriever = vectorstore.as_retriever(
        search_type="mmr",
        search_kwargs={"k": 6, "score_threshold": 0.65}
    )
    chain = ({"context": retriever, "question": RunnablePassthrough()} \
             | ANALYTICAL_PROMPT | llm)
    result = chain.invoke(q)
    return {"answer": result}

def answer_table(tables: List[Dict], q: str) -> Dict:
    matches = [t for t in tables if any(tok.lower() in str(t['data']).lower() for tok in q.split())]
    if not matches:
        return {"answer": "No relevant tables found."}
    ctx = "\n\n".join(
        f"Page {t['page']} cols({','.join(t['columns'])}): {str(t['data'][:3])}..."
        for t in matches
    )
    ans = llm.invoke(TABLE_PROMPT.format(table_context=ctx, question=q))
    return {"answer": ans}

def extract_answer(response: str) -> str:
    """Extract just the answer part from a structured response"""
    if "[Answer]" in response:
        answer_part = response.split("[Answer]")[1].split("[Analysis]")[0].strip()
        return answer_part
    return response  # Return the whole response if no structured format found

# ---------------- Main ----------------
if __name__ == '__main__':
    # Prepare paths
    chroma_dir = os.path.join(processing_dir, "chroma_db")
    if not os.path.isdir(chroma_dir):
        print("Document not processed yet.")
        sys.exit(0)

    q_type = route_question(question)
    if q_type == "table":
        tables = load_tables(processing_dir)
        out = answer_table(tables, question)
    else:
        vs = load_vectorstore(chroma_dir)
        out = answer_general(vs, question)

    # Extract just the answer part if needed and print only that
    answer_text = extract_answer(out["answer"])
    print(answer_text)
    sys.exit(0)