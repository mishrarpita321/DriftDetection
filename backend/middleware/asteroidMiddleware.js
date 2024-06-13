const { WebSocket } = require("ws");
const { getAsteroidOrbitalPosition, getOtbitalDatabyId } = require("../utils/predictAsteroidPosition");

const simulatedTimes = new Map(); 

function subscribeToAsteroid(ws, updateIntervals, AsteroidSubscribers, data) {
    console.log('previousSimulatedIntervalRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR:', ws.previousSimulatedInterval)
    const asteroidId = data.id;
    const simulatedInterval = data.simulatedInterval;

    if (!AsteroidSubscribers.has(asteroidId)) {
        AsteroidSubscribers.set(asteroidId, new Map());
    }

    const asteroidSubs = AsteroidSubscribers.get(asteroidId);
    if (!asteroidSubs.has(simulatedInterval)) {
        asteroidSubs.set(simulatedInterval, new Set());
    }

    asteroidSubs.get(simulatedInterval).add(ws);

    if (!ws.previousSimulatedInterval) {
        ws.previousSimulatedInterval = simulatedInterval;
    }

    if (!updateIntervals.has(asteroidId)) {
        getOtbitalDatabyId(asteroidId)
            .then(orbitalData => {
                let simulatedTime = simulatedTimes.get(asteroidId) || new Date();
                const intervalId = setInterval(async () => {
                    simulatedTime = new Date(simulatedTime.getTime() + simulatedInterval);
                    const position = await getAsteroidOrbitalPosition(orbitalData, simulatedTime);
                    const message = JSON.stringify({
                        type: 'asteroidPosition',
                        id: asteroidId,
                        orbitalData: orbitalData,
                        position,
                        simulatedTime: simulatedTime.toISOString()
                    });

                    console.log('Simulated time:', simulatedTime.toISOString(), 'for asteroid:', asteroidId);

                    asteroidSubs.forEach((intervalSubs, interval) => {
                        intervalSubs.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(message);
                            }
                        });
                    });

                   
                    simulatedTimes.set(asteroidId, simulatedTime);
                }, 1000); // Run every second
                updateIntervals.set(asteroidId, intervalId);
            })
            .catch(error => {
                console.error('Error getting orbital data:', error);
            });
    }
}

function unsubscribeFromAsteroid(ws, updateIntervals, AsteroidSubscribers, data, from = 'close') {
    const asteroidId = data.id;
    const simulatedInterval = data.simulatedInterval;
    const asteroidSubs = AsteroidSubscribers.get(asteroidId);
    if (asteroidSubs) {
        const intervalSubs = asteroidSubs.get(simulatedInterval);
        if (intervalSubs) {
            intervalSubs.delete(ws);
            if (intervalSubs.size === 0) {
                asteroidSubs.delete(simulatedInterval);
            }
        }

        if (asteroidSubs.size === 0) {
            clearInterval(updateIntervals.get(asteroidId));
            updateIntervals.delete(asteroidId);
            AsteroidSubscribers.delete(asteroidId);
            if (from === 'close') {
                simulatedTimes.delete(asteroidId);
            }
            console.log(`Stopped tracking asteroid ${asteroidId} due to no subscribers.`);
        }
    }
}

function handleIntervalChange(ws, updateIntervals, AsteroidSubscribers, data) {
    const previousData = { ...data, simulatedInterval: ws.previousSimulatedInterval };
    console.log('Unsubscribing from previous interval:', ws.previousSimulatedInterval);

    ws.previousSimulatedInterval = data.simulatedInterval;

    console.log('Subscribing to new interval:', data.simulatedInterval);

    const asteroidId = data.id;
    const lastSimulatedTime = simulatedTimes.get(asteroidId) || new Date();

    unsubscribeFromAsteroid(ws, updateIntervals, AsteroidSubscribers, previousData, from = 'intervalChange');
    subscribeToAsteroid(ws, updateIntervals, AsteroidSubscribers, {
        ...data,
        simulatedTime: lastSimulatedTime
    });
}

module.exports = { subscribeToAsteroid, unsubscribeFromAsteroid, handleIntervalChange };
