const { Neurosity } = require("@neurosity/sdk");

const dotenv = require("dotenv");
dotenv.config();

const dgram = require('dgram');
const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

const neurosity = new Neurosity({
    timesync: true,
    streamingMode: "wifi",
    autoSelectDevice: true
});

const MULTI_CAST_ADDRESS = "224.1.1.1"; // 192.168.178.48
const TARGET_IP = "192.168.178.48";
const PORT = process.env.UDP_LISTENER_PORT || 3001;

var keepAlive = setInterval(() => {
}, 1000);

// open socket and start streaming
socket.bind(() => {
    socket.setBroadcast(true);

    streamUDP();

});

async function streamUDP() {

    // connect to crown
    try {
        await neurosity.login({
            email: process.env.NEUROSITY_EMAIL,
            password: process.env.NEUROSITY_PASSWORD
        });
        console.log("Logged in");
    } catch (error) {
        console.log(error);
        clearInterval(keepAlive);
        return;
    }
    console.log("Neurosity is ready");

    // subscribe to eeg data
    neurosity.calm().subscribe((data) => {
        const message = Buffer.from(data.probability.toFixed(6) + ';');
        const ip = TARGET_IP || MULTI_CAST_ADDRESS;
        console.log("Sending data", data);
        socket.send(message, 0, message.length, PORT, ip, (err) => {
            if (err) {
                console.error('Broadcast error:', err)
                socket.close()
                clearInterval(broadcastInterval)
            }
        });
    });

}

// logout on exit
process.on("exit", async () => {
    await neurosity.logout();
    console.log("Logged out");
    clearInterval(keepAlive);
});
