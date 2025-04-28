import { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import { getAllDocuments } from './services/api';

function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const docs = await getAllDocuments();
        setDocuments(docs);
      } catch (error) {
        console.error('Failed to fetch documents:', error);
      }
    };

    fetchDocuments();
  }, []);

  const handleDocumentSelect = (doc) => {
    setSelectedDocument(doc);
    setMessages([
      {
        role: 'system',
        content: `Document "${doc.name}" selected. You can now ask questions about it.`
      }
    ]);
  };

  const handleDocumentUpload = (newDoc) => {
    setDocuments([...documents, newDoc]);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar 
        documents={documents} 
        onDocumentSelect={handleDocumentSelect}
        onDocumentUpload={handleDocumentUpload}
        selectedDocument={selectedDocument}
      />
      <ChatArea 
        messages={messages} 
        setMessages={setMessages}
        selectedDocument={selectedDocument}
        loading={loading}
        setLoading={setLoading}
      />
    </div>
  );
}

export default App;
