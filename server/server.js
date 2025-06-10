// server.js
const express      = require('express');
const multer       = require('multer');
const cors         = require('cors');
const mongoose     = require('mongoose');
const fs           = require('fs');
const path         = require('path');
const { v4: uuidv4 } = require('uuid');
const { spawn }    = require('child_process');

// Import database models
const Document     = require('./models/Document');
const Conversation = require('./models/Conversation');

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose.connect(
  'mongodb+srv://parthibanad23:Parthiban1805@cluster0.ilelo6m.mongodb.net/?retryWrites=true&w=majority',
  { useNewUrlParser: true, useUnifiedTopology: true }
)
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// ─── Multer Upload Setup ──────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    file.mimetype === 'application/pdf'
      ? cb(null, true)
      : cb(new Error('Only PDF files are allowed'), false);
  }
});

// ─── API ROUTES ────────────────────────────────────────────────────────────────

// GET server response for checking
app.get('/', (req, res) => {
  res.send('AITutor backend is running!');
});


// GET all documents
app.get('/api/documents', async (req, res) => {
  try {
    const docs = await Document.find().sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST upload a new PDF
app.post('/api/documents/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const doc = new Document({
      name:     req.file.originalname,
      filename: req.file.filename,
      filepath: req.file.path,
      size:     req.file.size,
      mimeType: req.file.mimetype,
    });
    await doc.save();

    // fire-and-forget processing
    processDocument(doc._id, req.file.path);

    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET a single document
app.get('/api/documents/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// POST ask question against a processed document
app.post('/api/documents/:id/ask', async (req, res) => {
  try {
    const { id }       = req.params;
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required' });

    const doc = await Document.findById(id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (!doc.isProcessed) {
      return res
        .status(400)
        .json({ error: 'Document still processing. Please try again shortly.' });
    }

    // ←— **HERE** use the *processing* folder, not the raw PDF path
    const processingDir = path.join(__dirname, 'processing', id);
    const answer        = await askDocumentQuestion(processingDir, question);

    // save conversation
    await new Conversation({
      documentId: doc._id,
      question,
      answer:     answer.answer,
      sources:    answer.sources
    }).save();

    res.json(answer);
  } catch (err) {
    console.error('Error in /ask:', err);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

// ─── Document Processing Helpers ──────────────────────────────────────────────

async function processDocument(documentId, filePath) {
  const processingDir     = path.join(__dirname, 'processing', documentId.toString());
  const scriptPath        = path.resolve(__dirname, 'scripts', 'process_document.py');
  const pythonCommand     = process.platform === 'win32' ? 'python' : 'python3';

  // ensure output folder exists
  fs.mkdirSync(processingDir, { recursive: true });

  console.log('Running:', pythonCommand, [ scriptPath, filePath, processingDir ]);
  const py = spawn(pythonCommand, [ scriptPath, filePath, processingDir ], { windowsHide: true });

  py.stdout.on('data', data => console.log(`✔ ${data}`));
  py.stderr.on('data', data => console.error(`✘ ${data}`));

  py.on('close', async code => {
    if (code === 0) {
      console.log(`Processed ${documentId} successfully`);
      await Document.findByIdAndUpdate(documentId, { isProcessed: true });
    } else {
      console.error(`Python failed (code ${code})`);
      await Document.findByIdAndUpdate(documentId, {
        isProcessed:     false,
        processingError: `Python exited with code ${code}`
      });
    }
  });
}

async function askDocumentQuestion(processingDir, question) {
  return new Promise((resolve, reject) => {
    const path = require('path');
    const { spawn } = require('child_process');
    const scriptPath = path.resolve(__dirname, 'scripts', 'ask_question.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    const py = spawn(pythonCmd, [scriptPath, processingDir, question], { windowsHide: true });
    let output = '';
    let errOut = '';

    py.stdout.on('data', data => (output += data));
    py.stderr.on('data', data => (errOut += data));

    py.on('close', code => {
      if (code === 0) {
        // The Python script now returns only the answer part, no post-processing needed
        resolve({
          answer: output.trim()
        });
      } else {
        reject(new Error(errOut || `Python exited with code ${code}`));
      }
    });
  });
}

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
