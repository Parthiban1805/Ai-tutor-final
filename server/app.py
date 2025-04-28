#!/usr/bin/env python
import os
import re
import sys
import json
import uuid
import fitz
import pandas as pd
import logging
from typing import List, Dict, Optional
import google.generativeai as genai
from langchain_google_genai.embeddings import GoogleGenerativeAIEmbeddings
from langchain_google_genai.llms import GoogleGenerativeAI
from langchain.docstore.document import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain.prompts import PromptTemplate
from langchain_core.runnables import RunnablePassthrough

# ========== Logging Setup ==========
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ========== Configurations ==========
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "AIzaSyCnI1h12n7DxEXXIAKdIp0g6eJEXXehVkc")
TEMPERATURE = 0.8

# ========== Google Gemini & Embeddings ==========
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

# ========== Prompt Templates ==========
ANALYTICAL_PROMPT = PromptTemplate.from_template(
"""
As an expert academic assistant, analyze the following context and question:

CONTEXT:
{context}

QUESTION: {question}

INSTRUCTIONS:
1. First determine if the question is answerable from the context
2. If answer exists:
   - Provide a precise answer
   - Include relevant numbers, names, or specifics
   - Cite sources with page numbers
3. If partially answerable:
   - State what information is available
   - Note what's missing
   - Suggest where to find more details
4. If unanswerable:
   - Explain why
   - Suggest related available information

FORMAT:
[Answer] Direct response to question
[Analysis] How the answer was derived
[Sources] Page references (if available)
[Related Info] Potentially useful related content
"""
)

TABLE_PROMPT = PromptTemplate.from_template(
"""
Analyze the following table data extracted from the document:

TABLE CONTEXT:
{table_context}

QUESTION: {question}

INSTRUCTIONS:
1. Interpret the table structure
2. Extract relevant rows/columns
3. Perform any necessary calculations
4. Provide the answer with:
   - Numerical values if quantitative
   - Clear comparisons if qualitative
   - Proper units/context
"""
)

# ========== PDF & Table Extraction ==========
def extract_tables(pdf_path: str) -> List[Dict]:
    doc = fitz.open(pdf_path)
    tables = []
    for page_num, page in enumerate(doc, start=1):
        tabs = page.find_tables()
        if tabs.tables:
            for tno, table in enumerate(tabs.tables, start=1):
                df = table.to_pandas()
                tables.append({
                    "page": page_num,
                    "table_num": tno,
                    "data": df.to_dict(orient="records"),
                    "columns": list(df.columns),
                    "shape": df.shape
                })
    return tables


def enhanced_pdf_loader(pdf_path: str) -> List[Document]:
    doc = fitz.open(pdf_path)
    docs: List[Document] = []
    tables = extract_tables(pdf_path)
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text("text", sort=True)
        ptables = [t for t in tables if t["page"] == page_num]
        table_text = ""
        if ptables:
            parts = []
            for t in ptables:
                snippet = str(t["data"][:2]).replace("\n", " ")
                parts.append(f"Table {t['table_num']} (cols: {t['shape'][1]}): {snippet}...")
            table_text = "\n\n[TABLE DATA]\n" + "\n".join(parts)
        docs.append(Document(
            page_content=f"PAGE {page_num}:\n{text}\n{table_text}",
            metadata={"source": os.path.basename(pdf_path), "page": page_num, "has_tables": bool(ptables)}
        ))
    return docs


def extract_structured_curriculum(pdf_path: str) -> Dict:
    doc = fitz.open(pdf_path)
    curriculum: Dict = {}
    current: Optional[str] = None
    for pno, page in enumerate(doc, start=1):
        blocks = page.get_text("blocks", sort=True)
        for b in blocks:
            content = b[4].strip()
            if re.match(r"(SEMESTER|SEM|TERM)\s*[1-4]", content, re.I):
                current = content.upper()
                curriculum[current] = {"labs": [], "other": []}
                continue
            if current and any(ind in content for ind in ["Lab","Practical","L)","-L","(P)"]):
                info = re.sub(r"\s+"," ", content.split("$")[0]).strip()
                curriculum[current]["labs"].append({"page": pno, "course": info})
    return curriculum


def format_semester_labs_response(curr: Dict, sems: List[str]) -> str:
    out: List[str] = []
    for s in sems:
        key = f"SEMESTER {s}"
        out.append(f"\n📚 {key} LAB COURSES:")
        if key not in curr or not curr[key]["labs"]:
            out.append("No lab courses identified")
        else:
            for lab in curr[key]["labs"]:
                out.append(f"- {lab['course']} (Page {lab['page']})")
    return "\n".join(out)

# ========== Text Splitting & Vectorization ==========
def semantic_chunker(docs: List[Document]) -> List[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=400,
        separators=["\n\n","\n• ","\n",". ","! ","? ","; "," ",""],
        length_function=len,
        keep_separator=True
    )
    return splitter.split_documents(docs)


def create_smart_vectorstore(docs: List[Document]) -> Chroma:
    return Chroma.from_documents(
        documents=docs,
        embedding=embedding_model,
        persist_directory=CHROMA_DIR,
        collection_metadata={"hnsw:space":"cosine","content_type":"academic_pdf"}
    )

# ========== QA System ==========
def route_question(question: str) -> str:
    ql = question.lower()
    if any(w in ql for w in ["how many","count","number of","total"]):
        return "quantitative"
    if any(w in ql for w in ["table","chart","figure","data"]):
        return "table"
    return "general"


class EnhancedAcademicQA:
    def __init__(self):
        self.curriculum: Dict = {}
    def preprocess_document(self, pdf_path: str):
        self.curriculum = extract_structured_curriculum(pdf_path)
    def handle_semester_query(self, question: str) -> str:
        sems = re.findall(r"[1-4]", question)
        if not sems:
            sems = ["1","2","3","4"]
        return format_semester_labs_response(self.curriculum, sems)


class AcademicQASystem:
    def __init__(self):
        self.vectorstore: Optional[Chroma] = None
        self.tables: List[Dict] = []
    def initialize(self, pdf_path: str):
        logger.info("Indexing started for %s", pdf_path)
        raw = enhanced_pdf_loader(pdf_path)
        logger.info("Pages: %d", len(raw))
        chunks = semantic_chunker(raw)
        logger.info("Chunks: %d", len(chunks))
        self.vectorstore = create_smart_vectorstore(chunks)
        logger.info("Vectorstore ready")
        self.tables = extract_tables(pdf_path)
        logger.info("Tables: %d", len(self.tables))
    def answer_general(self, question: str) -> Dict:
        retriever = self.vectorstore.as_retriever(search_type="mmr", search_kwargs={"k":6,"score_threshold":0.65})
        chain = ({"context":retriever,"question":RunnablePassthrough()} | ANALYTICAL_PROMPT | llm)
        resp = chain.invoke(question)
        pages = list({d.metadata.get("page","?") for d in retriever.get_relevant_documents(question)})
        return {"answer": resp, "sources": pages}
    def answer_table(self, question: str) -> Dict:
        matches = [t for t in self.tables if any(tok.lower() in str(t["data"]).lower() for tok in question.split())]
        if not matches:
            return {"answer": "No tables found.", "sources": []}
        ctx = "\n\n".join(f"Page {t['page']} cols({','.join(t['columns'])}): {str(t['data'][:3])}..." for t in matches)
        ans = llm.invoke(TABLE_PROMPT.format(table_context=ctx, question=question))
        pages = list({t['page'] for t in matches})
        return {"answer": ans, "sources": pages}
    def answer(self, question: str) -> Dict:
        return self.answer_table(question) if route_question(question) == "table" else self.answer_general(question)

# ========== CLI Entrypoint ==========
if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(json.dumps({"error": "Usage: python ask_question.py <pdf_path> <question>"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    question = sys.argv[2]

    qa_system = AcademicQASystem()
    qa_system.initialize(pdf_path)
    enhanced_qa = EnhancedAcademicQA()
    enhanced_qa.preprocess_document(pdf_path)

    if re.search(r"semester", question, re.I):
        answer = enhanced_qa.handle_semester_query(question)
        sources = []
    else:
        resp = qa_system.answer(question)
        answer = resp["answer"]
        sources = resp["sources"]

    print(json.dumps({"answer": answer, "sources": sources}))
    sys.exit(0)
