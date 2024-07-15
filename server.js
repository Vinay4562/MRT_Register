const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3500;
const mongoUri = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Middleware
app.use(bodyParser.json());
app.use(cors({ origin: 'http://400kvssshankarpally.free.nf' })); // Replace with your frontend domain
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the 'public' folder

// Define schema and model
const feederSchema = new mongoose.Schema({
    feederName: { type: String, required: true },
    lastTestedDate: { type: Date, required: true },
    scheduledDate: { type: Date, required: true },
    status: { type: String, required: true },
    remarks: { type: String }
});

const Feeder = mongoose.model('Feeder', feederSchema);

// Routes
app.get('/feeders', async (req, res) => {
    try {
        const feeders = await Feeder.find();
        res.json(feeders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/feeders', async (req, res) => {
    const feeder = new Feeder(req.body);
    try {
        await feeder.save();
        res.status(201).json(feeder);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.put('/feeders/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const updatedFeeder = await Feeder.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
        if (!updatedFeeder) {
            return res.status(404).json({ message: 'Feeder not found' });
        }
        res.json(updatedFeeder);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.delete('/feeders/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const feeder = await Feeder.findByIdAndDelete(id);
        if (!feeder) {
            return res.status(404).json({ message: 'Feeder not found' });
        }
        res.sendStatus(204);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// General error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
