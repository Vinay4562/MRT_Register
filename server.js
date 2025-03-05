const express = require('express');
const mongoose = require('mongoose');
const MongoStore = require("connect-mongo");
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3500;
const mongoUri = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors({
    origin: ['http://400kvssshankarpally.free.nf', 'https://mrt-register-git-main-vinay-kumars-projects-f1559f4a.vercel.app'],
    credentials: true
}));
app.use(express.static(path.join(__dirname, 'public')));

// Session Middleware
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'default_secret', // Fallback value
        resave: false,
        saveUninitialized: true,
        store: MongoStore.create({
            mongoUrl: mongoUri, // Use the correct MongoDB URI
        }),
        cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1-day expiration
    })
);

// Passport Configuration
app.use(passport.initialize());
app.use(passport.session());

const defaultUsername = 'Shankarpally400kv';
const hashedPassword = bcrypt.hashSync('Shankarpally@9870', 10);

passport.use(new LocalStrategy((username, password, done) => {
    if (username === defaultUsername && bcrypt.compareSync(password, hashedPassword)) {
        return done(null, { username });
    }
    return done(null, false, { message: 'Invalid credentials' });
}));

passport.serializeUser((user, done) => done(null, user.username));
passport.deserializeUser((username, done) => done(null, { username }));

// Authentication Routes
app.get('/api/check-auth', (req, res) => {
    res.status(req.session.loggedIn ? 200 : 401).json({ authenticated: !!req.session.loggedIn });
});

app.get('/login', (req, res) => {
    req.session.loggedIn ? res.redirect('/MRTregister.html') : res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === defaultUsername && bcrypt.compareSync(password, hashedPassword)) {
        req.session.loggedIn = true;
        req.session.username = username;
        return res.redirect('/MRTregister.html');
    }
    res.status(401).send('Invalid credentials. <a href="/login">Try again</a>');
});

app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ message: 'Logout failed' });
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Logged out successfully' });
    });
});

app.get('/MRTregister.html', (req, res) => {
    req.session.loggedIn ? res.sendFile(path.join(__dirname, 'public', 'MRTregister.html')) : res.redirect('/login');
});

// Define Feeder Schema & Model
const feederSchema = new mongoose.Schema({
    feederName: { type: String, required: true },
    lastTestedDate: { type: String, required: true }, // Store as string
    scheduledDate: { type: String, required: true },  // Store as string
    status: { type: String, required: true },
    remarks: { type: String }
});

const Feeder = mongoose.model('Feeder', feederSchema);

// Middleware to validate date format (DD-MM-YYYY)
const validateDateFormat = (req, res, next) => {
    const dateRegex = /^\d{2}-\d{2}-\d{4}$/; // Regex for DD-MM-YYYY format
    const { lastTestedDate, scheduledDate } = req.body;

    if (!dateRegex.test(lastTestedDate) || !dateRegex.test(scheduledDate)) {
        return res.status(400).json({ message: 'Invalid date format. Use DD-MM-YYYY.' });
    }

    next(); // Proceed to the next middleware/route handler
};

// CRUD Routes for Feeders
app.get('/feeders', async (req, res) => {
    try {
        const feeders = await Feeder.find();
        res.json(feeders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/feeders', validateDateFormat, async (req, res) => {
    try {
        const feeder = new Feeder(req.body);
        await feeder.save();
        res.status(201).json(feeder);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.put('/feeders/:id', validateDateFormat, async (req, res) => {
    try {
        const updatedFeeder = await Feeder.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        updatedFeeder ? res.json(updatedFeeder) : res.status(404).json({ message: 'Feeder not found' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.delete('/feeders/:id', async (req, res) => {
    try {
        const feeder = await Feeder.findByIdAndDelete(req.params.id);
        feeder ? res.sendStatus(204) : res.status(404).json({ message: 'Feeder not found' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ✅ Function to Parse DD-MM-YYYY format
function parseDDMMYYYY(dateString) {
    if (!dateString) return null;

    const [day, month, year] = dateString.split('-').map(Number);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    return new Date(year, month - 1, day); // Months are 0-based
}

// ✅ Nodemailer Setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ✅ Send Email Function
async function sendEmail(feederName, scheduledDate) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.NOTIFY_EMAIL,
        subject: `MRT Testing Reminder - ${feederName}`,
        text: `Reminder: MRT Testing for ${feederName} is scheduled on ${scheduledDate}. Please ensure necessary preparations.`
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent for ${feederName}: ${info.messageId}`);
    } catch (error) {
        console.error(`❌ Error sending email for ${feederName}:`, error);
    }
}

// ✅ Twilio SMS Setup
const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ✅ Send SMS Function
async function sendSMS(feederName, scheduledDate) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        console.error("❌ Twilio credentials missing! Check .env file.");
        return;
    }

    try {
        const message = await twilioClient.messages.create({
            body: `Reminder: MRT Testing for ${feederName} is scheduled on ${scheduledDate}. Please prepare accordingly.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: process.env.ADMIN_PHONE_NUMBER
        });
        console.log(`✅ SMS sent for ${feederName}. SID: ${message.sid}`);
    } catch (error) {
        console.error(`❌ Error sending SMS for ${feederName}:`, error);
    }
}

// ✅ Fetch Feeders Scheduled for Today
async function getFeedersScheduledForToday() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Normalize to start of today

    console.log("🗓️ Checking Feeders for:", today.toISOString());

    try {
        const feeders = await Feeder.find(); // Fetch all feeders from DB

        // Filter feeders scheduled for today with 'Pending' or 'Incomplete' status
        const feedersForToday = feeders.filter(feeder => {
            const scheduledDate = parseDDMMYYYY(feeder.scheduledDate);

            if (!scheduledDate) return false;
            scheduledDate.setUTCHours(0, 0, 0, 0); // Normalize to midnight

            return scheduledDate.getTime() === today.getTime() &&
                   (feeder.status === "Pending" || feeder.status === "Incomplete");
        });

        console.log(`📢 Found ${feedersForToday.length} feeders scheduled for today.`);
        return feedersForToday;
    } catch (error) {
        console.error("❌ Error fetching feeders:", error);
        return [];
    }
}

// ✅ Email Reminder Cron Job (Runs at 07:00 AM UTC daily)
cron.schedule('0 7 * * *', async () => {
    console.log("🚀 Running Email Reminder Job...");
    try {
        const feeders = await getFeedersScheduledForToday();
        if (feeders.length === 0) {
            console.log("✅ No feeders scheduled for today.");
            return;
        }
        await Promise.all(feeders.map(feeder => sendEmail(feeder.feederName, feeder.scheduledDate)));
    } catch (error) {
        console.error("❌ Error in email cron job:", error);
        await sendEmail(
            "Cron Job Failure",
            `Email reminder job failed at ${new Date().toISOString()}. Error: ${error.message}`
        );
    }
}, {
    timezone: "Asia/Kolkata"
});

// ✅ SMS Reminder Cron Job (Runs at 01:30 AM UTC / 07:00 AM IST)
cron.schedule('0 7 * * *', async () => {
    console.log("🚀 Running SMS Reminder Job...");
    try {
        const feeders = await getFeedersScheduledForToday();
        if (feeders.length === 0) {
            console.log("✅ No feeders scheduled for today.");
            return;
        }
        await Promise.all(feeders.map(feeder => sendSMS(feeder.feederName, feeder.scheduledDate)));
    } catch (error) {
        console.error("❌ Error in SMS cron job:", error);
        await sendEmail(
            "Cron Job Failure",
            `SMS reminder job failed at ${new Date().toISOString()}. Error: ${error.message}`
        );
    }
}, {
    timezone: "Asia/Kolkata"
});

console.log("🚀 Reminder Schedulers are Running...");

// Manual Test Route
app.get('/test-sms', async (req, res) => {
    const feeder = await Feeder.findOne();  // Fetch any feeder
    if (!feeder) return res.status(404).send("No scheduled feeders found.");

    await sendSMS(feeder.feederName, feeder.scheduledDate);
    res.send("✅ SMS test triggered successfully!");
});

// Manual Test Route for Email (Add this below /test-sms)
app.get('/test-email', async (req, res) => {
    const feeder = await Feeder.findOne();
    if (!feeder) return res.status(404).send("No scheduled feeders found.");
    await sendEmail(feeder.feederName, feeder.scheduledDate);
    res.send("✅ Email test triggered successfully!");
});

app.get('/check-env', (req, res) => {
    res.json({
        ADMIN_PHONE_NUMBER: process.env.ADMIN_PHONE_NUMBER,
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER
    });
});

// Add this route to server.js to check server time
app.get('/server-time', (req, res) => {
    res.send(`Server time: ${new Date().toString()}`);
});

// General error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));