const { getFeedersScheduledForToday } = require('./server'); // Replace with actual filename

getFeedersScheduledForToday()
    .then(feeders => {
        console.log("📢 Feeders scheduled for today:", feeders);
        process.exit(0);
    })
    .catch(err => {
        console.error("❌ Error fetching feeders:", err);
        process.exit(1);
    });
