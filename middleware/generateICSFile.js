const ics = require('ics');
const fs = require('fs');
const path = require('path');
const Purchase = require('../model/purchase'); // Adjust path if necessary

const generateICSFile = async (purchaseId) => {
    try {
        // Fetch the specific purchase from the Purchase model
        const purchase = await Purchase.findById(purchaseId).populate('medications.medication');

        if (!purchase) {
            console.log('No purchase found for the given ID.');
            return null;
        }

        // Prepare the events array
        const events = [];
        // console.log(purchase.medications)

        // Inside your loop for each medication
        purchase.medications.forEach(purchaseMed => {
            const medication = purchaseMed.medication;
            const { nameOfDrugs, dosage, frequency, duration } = medication;
        
            const daysOrWeeks = Array.from({ length: duration.value }, (_, i) => i); // Array for each day/week based on duration
        
            const baseStart = purchaseMed.startTime ? new Date(purchaseMed.startTime) : new Date();
            const baseEnd = new Date(baseStart);
            baseEnd.setMinutes(baseEnd.getMinutes() + 30); // Duration for each event
        
            daysOrWeeks.forEach(offset => {
                const eventStart = new Date(baseStart);
                const eventEnd = new Date(baseEnd);
        
                // Adjust dates based on the duration unit (days or weeks)
                if (duration.unit === 'days') {
                    eventStart.setDate(baseStart.getDate() + offset);
                    eventEnd.setDate(baseEnd.getDate() + offset);
                } else if (duration.unit === 'weeks') {
                    eventStart.setDate(baseStart.getDate() + (offset * 7));
                    eventEnd.setDate(baseEnd.getDate() + (offset * 7));
                }
        
                if (frequency.unit === 'days') {
                    // Daily medication reminders
                    events.push({
                        start: [eventStart.getFullYear(), eventStart.getMonth() + 1, eventStart.getDate(), eventStart.getHours(), eventStart.getMinutes()],
                        end: [eventEnd.getFullYear(), eventEnd.getMonth() + 1, eventEnd.getDate(), eventEnd.getHours(), eventEnd.getMinutes()],
                        title: `${nameOfDrugs} (${dosage}) Reminder`,
                        description: `Time to take your ${nameOfDrugs} (${dosage}).`,
                    });
        
                    const dailyIntervals = 24 / frequency.value;
                    for (let i = 1; i < dailyIntervals; i++) {
                        const intervalEventStart = new Date(eventStart);
                        const intervalEventEnd = new Date(eventEnd);
                        intervalEventStart.setHours(eventStart.getHours() + (i * (24 / dailyIntervals)));
                        intervalEventEnd.setHours(eventEnd.getHours() + (i * (24 / dailyIntervals)));
        
                        events.push({
                            start: [intervalEventStart.getFullYear(), intervalEventStart.getMonth() + 1, intervalEventStart.getDate(), intervalEventStart.getHours(), intervalEventStart.getMinutes()],
                            end: [intervalEventEnd.getFullYear(), intervalEventEnd.getMonth() + 1, intervalEventEnd.getDate(), intervalEventEnd.getHours(), intervalEventEnd.getMinutes()],
                            title: `${nameOfDrugs} (${dosage}) Reminder`,
                            description: `Time to take your ${nameOfDrugs} (${dosage}).`,
                        });
                    }
                } else if (frequency.unit === 'hours') {
                    // Medication reminders every X hours
                    const intervalHours = frequency.value;
                    const dailyIntervals = 24 / intervalHours;
        
                    for (let i = 0; i < dailyIntervals; i++) {
                        const intervalEventStart = new Date(eventStart);
                        const intervalEventEnd = new Date(eventEnd);
                        intervalEventStart.setHours(eventStart.getHours() + (i * intervalHours));
                        intervalEventEnd.setHours(eventEnd.getHours() + (i * intervalHours));
        
                        events.push({
                            start: [intervalEventStart.getFullYear(), intervalEventStart.getMonth() + 1, intervalEventStart.getDate(), intervalEventStart.getHours(), intervalEventStart.getMinutes()],
                            end: [intervalEventEnd.getFullYear(), intervalEventEnd.getMonth() + 1, intervalEventEnd.getDate(), intervalEventEnd.getHours(), intervalEventEnd.getMinutes()],
                            title: `${nameOfDrugs} (${dosage}) Reminder`,
                            description: `Time to take your ${nameOfDrugs} (${dosage}).`,
                        });
                    }
                }
            });
        });
        
        

        // Generate ICS file content
        return new Promise((resolve, reject) => {
            ics.createEvents(events, (error, value) => {
                if (error) {
                    console.error('Error generating ICS file:', error);
                    reject(error);
                } else {
                    const filePath = path.join(__dirname, 'medication-reminders.ics');
                    fs.writeFile(filePath, value, (err) => {
                        if (err) {
                            console.error('Error writing ICS file:', err);
                            reject(err);
                        } else {
                            console.log('ICS file generated:', filePath);
                            resolve(filePath);
                        }
                    });
                }
            });
        });

    } catch (error) {
        console.error('Error fetching purchase data:', error);
        return null;
    }
};

module.exports = generateICSFile;
