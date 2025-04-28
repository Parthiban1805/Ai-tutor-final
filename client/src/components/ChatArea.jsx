import { useState, useRef, useEffect } from 'react';
import { askQuestion } from '../services/api';

function ChatArea({ messages, setMessages, selectedDocument, loading, setLoading }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!input.trim() || !selectedDocument?._id) return;

    if (!selectedDocument._id) {
      setMessages([...messages, {
        role: 'assistant',
        content: 'Error: Invalid document selected. Please try selecting the document again.',
        error: true
      }]);
      return;
    }

    const userMessage = {
      role: 'user',
      content: input
    };

    setMessages([...messages, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await askQuestion(selectedDocument._id, input);

      setMessages((prevMessages) => [
        ...prevMessages,
        {
          role: 'assistant',
          content: response.answer,
          sources: response.sources
        }
      ]);
    } catch (error) {
      console.error('Error asking question:', error);
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          role: 'assistant',
          content: `Error: ${error.message || 'Unknown error occurred'}`,
          error: true
        }
      ]);
    }

    setLoading(false);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Empty chat state
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col h-full bg-chatgpt-light dark:bg-chatgpt-light-bg font-sans">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl text-center">
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-chatgpt-text-light mb-4">
              {selectedDocument ? `Chat with "${selectedDocument.name}"` : 'Welcome to BIT CHATBOT'}
            </h2>
            <p className="text-chatgpt-secondary mb-6">
              {selectedDocument
                ? 'Ask questions about your document, and BIT CHATBOT will provide accurate answers based on its content.'
                : 'Upload a PDF from the sidebar to start a conversation.'}
            </p>
            <form onSubmit={handleSubmit} className="flex space-x-2 max-w-2xl mx-auto">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={!selectedDocument?._id}
                placeholder={
                  selectedDocument
                    ? 'Ask a question about your document...'
                    : 'Select a document to start chatting'
                }
                className="flex-1 p-3 bg-chatgpt-input border border-chatgpt-input-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-chatgpt-accent text-gray-800 dark:text-chatgpt-text-light"
              />
              <button
                type="submit"
                disabled={!selectedDocument?._id || !input.trim()}
                className="px-4 py-2 bg-chatgpt-accent text-white rounded-lg hover:bg-chatgpt-accent-hover disabled:bg-chatgpt-disabled dark:disabled:bg-chatgpt-disabled-light disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Chat with messages
  return (
    <div className="flex-1 flex flex-col h-full bg-chatgpt-light dark:bg-chatgpt-light-bg font-sans">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              } animate-fade-in`}
            >
              <div
                className={`p-4 rounded-lg max-w-2xl shadow-sm ${
                  message.role === 'user'
                    ? 'bg-chatgpt-user text-white dark:bg-chatgpt-user-light dark:text-white'
                    : message.role === 'system'
                    ? 'bg-chatgpt-input text-gray-800 dark:bg-chatgpt-assistant-light dark:text-chatgpt-text-light'
                    : 'bg-chatgpt-assistant text-gray-800 dark:bg-chatgpt-assistant-light dark:text-chatgpt-text-light border border-chatgpt-input-border dark:border-chatgpt-border-light'
                } ${message.error ? 'border-chatgpt-error border-2' : ''}`}
              >
                <p>{message.content}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-2 text-xs text-chatgpt-secondary">
                    Sources: Pages {message.sources.join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-4 bg-chatgpt-light dark:bg-chatgpt-light-bg border-t border-chatgpt-input-border dark:border-chatgpt-border-light">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="flex space-x-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={!selectedDocument?._id || loading}
                placeholder={
                  selectedDocument
                    ? 'Ask a question about your document...'
                    : 'Select a document to start chatting'
                }
                className="w-full p-3 bg-chatgpt-input border border-chatgpt-input-border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-chatgpt-accent dark:text-chatgpt-text-light"
              />
              <button
                type="submit"
                disabled={!selectedDocument?._id || !input.trim() || loading}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-chatgpt-secondary hover:text-chatgpt-accent disabled:text-chatgpt-disabled dark:disabled:text-chatgpt-disabled-light"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </form>
          {loading && (
            <div className="flex items-center justify-center mt-2">
              <svg className="animate-spin h-5 w-5 text-chatgpt-user dark:text-chatgpt-user-light" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="ml-2 text-sm text-chatgpt-secondary">Processing...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatArea;