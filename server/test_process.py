import fitz
import sys
from langchain.docstore.document import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
import google.generativeai as genai

PDF_PATH = r"C:\Users\sunda\Downloads\ChatGPT - Shared Content.pdf" # Replace

GOOGLE_API_KEY = "AIzaSyCnI1h12n7DxEXXIAKdIp0g6eJEXXehVkc"

genai.configure(api_key=GOOGLE_API_KEY)
embedding_model = GoogleGenerativeAIEmbeddings(
    model="models/embedding-001",
    google_api_key=GOOGLE_API_KEY
)

def enhanced_pdf_loader(pdf_path):
    doc = fitz.open(pdf_path)
    documents = []
    for i, page in enumerate(doc):
        text = page.get_text("text")
        documents.append(Document(page_content=text or "", metadata={"page": i+1}))
    return documents

try:
    raw_docs = enhanced_pdf_loader(PDF_PATH)
    print(f"Loaded {len(raw_docs)} pages")

    for idx, doc in enumerate(raw_docs):
        try:
            embedding = embedding_model.embed_query(doc.page_content)
            print(f"✅ Embedded page {idx+1} successfully.")
        except Exception as e:
            print(f"❌ Embedding failed on page {idx+1}: {str(e)}")
except Exception as e:
    print(f"Error: {str(e)}")
