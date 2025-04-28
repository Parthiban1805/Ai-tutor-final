// src/services/api.js
const API_BASE_URL = 'http://localhost:5000/api';

export const getAllDocuments = async () => {
  const res = await fetch(`${API_BASE_URL}/documents`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
};

export const uploadDocument = (formData, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/documents/upload`);
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload  = () => (xhr.status < 300 ? resolve(JSON.parse(xhr.response)) : reject(new Error('Upload failed')));
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });

export const askQuestion = async (documentId, question) => {
  if (!documentId) throw new Error('Document ID is required');
  const res = await fetch(`${API_BASE_URL}/documents/${documentId}/ask`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ question })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json(); // { answer: string, sources: number[] }
};
