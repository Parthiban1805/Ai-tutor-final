#!/usr/bin/env python
import os
import sys
import json
import fitz
from typing import List, Dict
import google.generativeai as genai
from langchain_google_genai.embeddings import GoogleGenerativeAIEmbeddings
from langchain.docstore.document import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma

# ========== CLI Arguments ==========
if len(sys.argv) != 3:
    print("Usage: python process_document.py <pdf_path> <output_dir>")
    sys.exit(1)

PDF_PATH    = sys.argv[1]
OUTPUT_DIR  = sys.argv[2]
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "AIzaSyCnI1h12n7DxEXXIAKdIp0g6eJEXXehVkc")

# ========== Configure Google Generative AI ==========
genai.configure(api_key=GOOGLE_API_KEY)
embedding_model = GoogleGenerativeAIEmbeddings(
    model="models/embedding-001",
    google_api_key=GOOGLE_API_KEY
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

# ========== PDF Loader ==========
def enhanced_pdf_loader(pdf_path: str) -> List[Document]:
    try:
        doc = fitz.open(pdf_path)
        return [Document(page_content=page.get_text("text") or "",
                         metadata={"source": pdf_path, "page": i+1})
                for i, page in enumerate(doc)]
    except Exception:
        from pypdf import PdfReader
        reader = PdfReader(pdf_path)
        return [Document(page_content=page.extract_text() or "",
                         metadata={"source": pdf_path, "page": i+1})
                for i, page in enumerate(reader.pages)]

# ========== Chunking ==========
def semantic_chunker(docs: List[Document]) -> List[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=400,
        separators=["\n\n","\n• ","\n",". ","! ","? ","; "," ",""],
        length_function=len,
        keep_separator=True
    )
    return splitter.split_documents(docs)

# ========== Main Processing ==========
def process_document(pdf_path: str, output_dir: str) -> None:
    print(f"Processing PDF: {pdf_path}")
    print(f"Output directory: {output_dir}")
    os.makedirs(output_dir, exist_ok=True)

    # Load and chunk
    raw_docs = enhanced_pdf_loader(pdf_path)
    print(f"Loaded {len(raw_docs)} raw pages")
    processed_docs = semantic_chunker(raw_docs)
    print(f"Created {len(processed_docs)} chunks")

    # Precompute embeddings
    embeddings = []
    for idx, doc in enumerate(processed_docs, start=1):
        try:
            emb = embedding_model.embed_query(doc.page_content)
            embeddings.append(emb)
            print(f"mbedded chunk {idx}")
        except Exception as e:
            print(f"Embedding failed for chunk {idx}: {e}")

    # Build vector store via add_documents()
    chroma_path = os.path.join(output_dir, "chroma_db")
    try:
        vs = Chroma(
        persist_directory=chroma_path,
        embedding_function=embedding_model
    )

        vs.add_documents(processed_docs)
        print("Vector store created via add_documents()")
    except Exception as e:
        print(f"Error creating vector store: {e}")

    # Extract and save tables
    tables = extract_tables(pdf_path)
    with open(os.path.join(output_dir, "tables.json"), "w") as f:
        json.dump(tables, f, indent=2)
    print(f"Extracted {len(tables)} tables")
    print(f"Document processed successfully. Chunks: {len(processed_docs)}")

if __name__ == '__main__':
    try:
        process_document(PDF_PATH, OUTPUT_DIR)
        sys.exit(0)
    except Exception as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        sys.exit(1)
