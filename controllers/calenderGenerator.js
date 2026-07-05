const fs = require("fs");
const ical = require("ical-generator");
const User = require("../model/user");
const Medication = require("../model/medication");

// Function to generate the ICS file
const generateICSFile = (events) => {
    // Create a new calendar instance
    const calendar = ical({name: 'my first iCal'});
    // Add each event to the calendar
    events.forEach(event => {
        calendar.createEvent({
            start: event.start,
            end: event.end,
            summary: event.summary,
            description: event.description,
        });
    });

    // Save the calendar to a file
    fs.writeFileSync('medication-reminders.ics', calendar.toString());
};

// Example events
const events = [
    {
        start: new Date(2024, 7, 6, 9, 0),
        end: new Date(2024, 7, 6, 9, 30),
        summary: 'Morning Medication Reminder',
        description: 'Time to take your morning medication.',
    },
    {
        start: new Date(2024, 7, 6, 18, 0),
        end: new Date(2024, 7, 6, 18, 30),
        summary: 'Evening Medication Reminder',
        description: 'Time to take your evening medication.',
    },
];

generateICSFile(events)