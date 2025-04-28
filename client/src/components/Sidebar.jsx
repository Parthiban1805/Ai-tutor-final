import { useState } from 'react';
import { uploadDocument } from '../services/api';

function Sidebar({ documents, onDocumentSelect, onDocumentUpload, selectedDocument }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isOpen, setIsOpen] = useState(true);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('document', file);

      const uploadedDoc = await uploadDocument(formData, (progress) => {
        setUploadProgress(progress);
      });

      onDocumentUpload(uploadedDoc);
      setUploading(false);
    } catch (error) {
      console.error('Upload failed:', error);
      setUploading(false);
    }
  };

  return (
    <>
      {/* Mobile toggle button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-20 p-2 bg-gray-800 text-white rounded-full"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar */}
      <div
        className={`${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 transition-transform duration-300 fixed lg:static top-0 left-0 z-10 w-72 h-full bg-gray-900 text-white flex flex-col font-sans`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h1 className="text-lg font-semibold"> 2025 BIT CHATBOT</h1>
        </div>

        {/* New Chat Button */}
        <div className="px-4 py-2">
          <button
            className="w-full flex items-center px-3 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
            onClick={() => {
              onDocumentSelect(null); // Reset to no document
              if (window.innerWidth < 1024) setIsOpen(false);
            }}
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Upload Section */}
        <div className="px-4 py-2 border-b border-gray-800">
          <div className="relative">
            <input
              type="file"
              className="hidden"
              id="file-upload"
              accept=".pdf"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <label
              htmlFor="file-upload"
              className="flex items-center justify-center px-3 py-2 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 w-full text-sm transition-colors"
            >
              {uploading ? (
                <span>{`Uploading... ${uploadProgress}%`}</span>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m-4-4l4-4 4 4" />
                  </svg>
                  Upload PDF
                </>
              )}
            </label>
            {uploading && (
              <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            )}
          </div>
        </div>

        {/* Documents List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-xs font-semibold text-gray-400 mb-2">Your Documents</h2>
            {documents.length === 0 ? (
              <p className="text-gray-500 text-sm">No documents uploaded</p>
            ) : (
              <ul className="space-y-1">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className={`px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors ${
                      selectedDocument?.id === doc.id ? 'bg-gray-800' : ''
                    }`}
                    onClick={() => {
                      onDocumentSelect(doc);
                      if (window.innerWidth < 1024) setIsOpen(false);
                    }}
                  >
                    <div className="text-sm truncate">{doc.name}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800">
          <div className="text-xs text-gray-500">© 2025 BIT CHATBOT</div>
        </div>
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-0"
          onClick={() => setIsOpen(false)}
        ></div>
      )}
    </>
  );
}

export default Sidebar;