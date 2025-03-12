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
const cronParser = require('cron-parser').default;
const nodemailer = require('nodemailer');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3500;
const mongoUri = process.env.MONGO_URI;

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors({
    origin: ['http://400kvssshankarpally.free.nf', 'https://mrt-register-git-main-vinay-kumars-projects-f1559f4a.vercel.app'],
    credentials: true
}));

// Serve static files, but exclude MRTregister.html
app.use(express.static(path.join(__dirname, 'public'), {
    redirect: false,
    index: false // Prevent serving index.html by default
}));

app.use(session({
    secret: process.env.SESSION_SECRET || 'default_secret',
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: mongoUri }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1-day expiration
        name: 'mrt_session'
    }
}));

const isAuthenticated = (req, res, next) => {
    if (req.session.loggedIn) {
        return next();
    }
    res.redirect('/login');
};

app.use(passport.initialize());
app.use(passport.session());

const defaultUsername = 'Shankarpally400kv';
const hashedPassword = bcrypt.hashSync('Shankarpally@9870', 10);

passport.use(new LocalStrategy((username, password, done) => {
    if (!username || !password) {
        return done(null, false, { message: 'Username and password are required' });
    }
    if (username === defaultUsername && bcrypt.compareSync(password, hashedPassword)) {
        return done(null, { username });
    }
    return done(null, false, { message: 'Invalid credentials' });
}));

passport.serializeUser((user, done) => done(null, user.username));
passport.deserializeUser((username, done) => done(null, { username }));

app.get('/api/check-auth', (req, res) => {
    res.status(req.session.loggedIn ? 200 : 401).json({ authenticated: !!req.session.loggedIn });
});

app.get('/login', (req, res) => {
    if (req.session.loggedIn) {
        return res.redirect('/MRTregister.html');
    }

    // Add headers to prevent caching
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
    });

    res.sendFile(path.join(__dirname, 'public', 'login.html'));
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
        res.clearCookie('mrt_session');
        res.redirect('/login');
    });
});

app.get('/MRTregister.html', isAuthenticated, (req, res) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    res.sendFile(path.join(__dirname, 'public', 'MRTregister.html'));
});

const feederSchema = new mongoose.Schema({
    feederName: { type: String, required: true },
    lastTestedDate: { type: String, required: true },
    scheduledDate: { type: String, required: true },
    status: { type: String, required: true },
    remarks: { type: String },
    lastNotified: { type: String }
});

const Feeder = mongoose.model('Feeder', feederSchema);

const validateDateFormat = (req, res, next) => {
    const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
    const { lastTestedDate, scheduledDate } = req.body;
    if (!dateRegex.test(lastTestedDate) || !dateRegex.test(scheduledDate)) {
        return res.status(400).json({ message: 'Invalid date format. Use DD-MM-YYYY.' });
    }
    next();
};

app.get('/feeders', isAuthenticated, async (req, res) => {
    try {
        const feeders = await Feeder.find();
        res.json(feeders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/feeders', isAuthenticated, validateDateFormat, async (req, res) => {
    try {
        const feeder = new Feeder(req.body);
        await feeder.save();
        res.status(201).json(feeder);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.put('/feeders/:id', isAuthenticated, validateDateFormat, async (req, res) => {
    try {
        const updatedFeeder = await Feeder.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        updatedFeeder ? res.json(updatedFeeder) : res.status(404).json({ message: 'Feeder not found' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.delete('/feeders/:id', isAuthenticated, async (req, res) => {
    try {
        const feeder = await Feeder.findByIdAndDelete(req.params.id);
        feeder ? res.sendStatus(204) : res.status(404).json({ message: 'Feeder not found' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/test-sms', isAuthenticated, async (req, res) => {
    const feeder = await Feeder.findOne();
    if (!feeder) return res.status(404).send("No scheduled feeders found.");
    try {
        await sendSMS(feeder.feederName, feeder.scheduledDate);
        res.send("✅ SMS test triggered successfully!");
    } catch (error) {
        console.error("SMS Error:", error);
        res.status(500).send("❌ Failed to send SMS: " + error.message);
    }
});

app.get('/test-email', isAuthenticated, async (req, res) => {
    const feeder = await Feeder.findOne();
    if (!feeder) return res.status(404).send("No scheduled feeders found.");
    try {
        await sendEmail(feeder.feederName, feeder.scheduledDate);
        res.send("✅ Email test triggered successfully!");
    } catch (error) {
        console.error("Email Error:", error);
        res.status(500).send("❌ Failed to send Email: " + error.message);
    }
});

app.get('/test-overdue', isAuthenticated, async (req, res) => {
    try {
        await updateOverdueFeeders();
        res.send("✅ Overdue feeder update triggered successfully!");
    } catch (error) {
        console.error("Overdue Feeder Error:", error);
        res.status(500).send("❌ Failed to update overdue feeders: " + error.message);
    }
});

// ✅ Function to Parse DD-MM-YYYY format (unchanged)
function parseDDMMYYYY(dateString) {
    if (!dateString) return null;

    const [day, month, year] = dateString.split('-').map(Number);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
        return null; // Invalid date
    }

    return date;
}

// ✅ Nodemailer Setup (unchanged)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ✅ Send Email Function (updated message)
async function sendEmail(feederName, scheduledDate) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.NOTIFY_EMAIL,
        subject: `MRT Testing Reminder - ${feederName}`,
        text: `Reminder: MRT Testing for ${feederName} is scheduled for tomorrow, ${scheduledDate}. Please ensure necessary preparations.`
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent for ${feederName}: ${info.messageId}`);
        await Feeder.updateMany(
            { feederName, scheduledDate },
            { lastNotified: new Date().toISOString() }
        );
    } catch (error) {
        console.error(`❌ Error sending email for ${feederName}:`, error);
    }
}

// ✅ Twilio SMS Setup (unchanged)
const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ✅ Send SMS Function (updated message)
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

// ✅ Fetch Feeders Scheduled for Tomorrow (renamed and updated)
async function getFeedersScheduledForTomorrow() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Normalize to start of today
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1); // Move to tomorrow

    console.log("🗓️ Checking Feeders for tomorrow:", tomorrow.toISOString());

    try {
        const feeders = await Feeder.find(); // Fetch all feeders from DB

        // Filter feeders scheduled for tomorrow with 'Pending' or 'Incomplete' status
        const feedersForTomorrow = feeders.filter(feeder => {
            const scheduledDate = parseDDMMYYYY(feeder.scheduledDate);

            if (!scheduledDate) return false;
            scheduledDate.setUTCHours(0, 0, 0, 0); // Normalize to midnight

            return scheduledDate.getTime() === tomorrow.getTime() &&
                   (feeder.status === "Pending" || feeder.status === "Incomplete");
        });

        console.log(`📢 Found ${feedersForTomorrow.length} feeders scheduled for tomorrow.`);
        return feedersForTomorrow;
    } catch (error) {
        console.error("❌ Error fetching feeders:", error);
        return [];
    }
}

// ✅ Fetch Overdue Pending Feeders and Update to Incomplete
async function updateOverdueFeeders() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Normalize to start of today

    console.log("🗓️ Checking for overdue feeders on:", today.toISOString());

    try {
        const feeders = await Feeder.find({ status: "Pending" }); // Fetch all Pending feeders

        // Filter feeders whose scheduledDate is before today
        const overdueFeeders = feeders.filter(feeder => {
            const scheduledDate = parseDDMMYYYY(feeder.scheduledDate);
            if (!scheduledDate) return false;
            scheduledDate.setUTCHours(0, 0, 0, 0); // Normalize to midnight
            return scheduledDate.getTime() < today.getTime(); // Past due
        });

        if (overdueFeeders.length > 0) {
            // Update all overdue feeders to Incomplete
            await Promise.all(overdueFeeders.map(feeder =>
                Feeder.updateOne(
                    { _id: feeder._id },
                    { status: "Incomplete" }
                )
            ));
            console.log(`✅ Updated ${overdueFeeders.length} overdue feeders to Incomplete.`);
        } else {
            console.log("✅ No overdue feeders found.");
        }
    } catch (error) {
        console.error("❌ Error updating overdue feeders:", error);
        await sendEmail(
            "Cron Job Failure",
            `Overdue feeder update job failed at ${new Date().toISOString()}. Error: ${error.message}`
        );
    }
}

// Track last cron job run time
let lastCronRun = null;

cron.schedule('0 7 * * *', async () => {
    console.log("🚀 Running Daily Reminder Job...");
    lastCronRun = new Date(); // Track last run time
    try {
        // Update overdue feeders
        await updateOverdueFeeders();

        // Send reminders for feeders scheduled for tomorrow
        const feeders = await getFeedersScheduledForTomorrow();
        if (feeders.length > 0) {
            console.log(`📨 Sending reminders to ${feeders.length} feeders...`);

            // Send emails and SMS concurrently
            const emailResults = await Promise.allSettled(
                feeders.map(feeder => sendEmail(feeder.feederName, feeder.scheduledDate))
            );
            const smsResults = await Promise.allSettled(
                feeders.map(feeder => sendSMS(feeder.feederName, feeder.scheduledDate))
            );

            // Log results
            emailResults.forEach((result, index) => {
                if (result.status === 'rejected') {
                    console.error(`❌ Failed to send email for ${feeders[index].feederName}:`, result.reason);
                }
            });
            smsResults.forEach((result, index) => {
                if (result.status === 'rejected') {
                    console.error(`❌ Failed to send SMS for ${feeders[index].feederName}:`, result.reason);
                }
            });

            console.log("✅ Reminders sent successfully.");
        } else {
            console.log("✅ No feeders scheduled for tomorrow.");
        }
    } catch (error) {
        console.error("❌ Error in daily reminder job:", error);
        await sendEmail(
            "Cron Job Failure",
            `Daily reminder job failed at ${new Date().toISOString()}. Error: ${error.message}`
        );
    }
}, { timezone: "Asia/Kolkata" });

console.log("🚀 Reminder Schedulers are Running...");

app.get('/check-env', (req, res) => {
    console.log("Environment Variables:", process.env);
    res.json({
        ADMIN_PHONE_NUMBER: process.env.ADMIN_PHONE_NUMBER,
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER
    });
});

app.get('/cron-status', (req, res) => {
    try {
        const cronExpression = '0 7 * * *';
        const interval = cronParser.parse(cronExpression);
        const nextRun = interval.next().toDate();

        // Convert to IST (Asia/Kolkata) using Intl.DateTimeFormat
        const formatter = new Intl.DateTimeFormat('en-GB', { 
            timeZone: 'Asia/Kolkata', 
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false 
        });

        const nextRunIST = formatter.format(nextRun);

        res.json({
            nextRunUTC: nextRun.toISOString(),
            nextRunIST: nextRunIST.replace(',', ''), // Remove comma for cleaner output
            timezone: "Asia/Kolkata"
        });
    } catch (error) {
        console.error("❌ Cron status error:", error);
        res.status(500).json({ message: "Failed to calculate cron status", error: error.message });
    }
});

// Add this route to server.js to check server time
app.get('/server-time', (req, res) => {
    res.send(`Server time: ${new Date().toString()}`);
});

// 404 Middleware
app.use((req, res, next) => {
    res.status(404).json({
        message: "🚀 Route not found!",
        path: req.path,
        method: req.method
    });
});

// General error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));