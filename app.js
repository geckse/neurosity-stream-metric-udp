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

const BUFFERSIZE = 10;

var keepAlive = setInterval(() => {
}, 1000);

// open socket and start streaming
socket.bind(() => {
    socket.setBroadcast(true);

    collectMetrics();
    streamUDP();

});

var bufferGroups = { 
    calm: {
        label: "calm",
        buffer: [],
        average: 0,
        normalised: 1,
        normalisedAverage: 1,
        lastValue: 0,
        threshold: 0.1,
        trend: 0
    },
    focus: {
        label: "focus",
        buffer: [],
        average: 0,
        normalised: 1,
        normalisedAverage: 1,
        lastValue: 0,
        threshold: 0.1,
        trend: 0
    }
};


async function collectMetrics(){
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
            return false;
        }
        console.log("Neurosity is ready");

    neurosity.calm().subscribe((data) => {
        bufferGroups.calm.buffer.push(data.probability);
        bufferGroups.calm.lastValue = data.probability;
        if(bufferGroups.calm.buffer.length > BUFFERSIZE){
            bufferGroups.calm.buffer.shift();
        }
        updateMetrics();
    });

    neurosity.focus().subscribe((data) => {
        bufferGroups.focus.buffer.push(data.probability);
        bufferGroups.focus.lastValue = data.probability;
        if(bufferGroups.focus.buffer.length > BUFFERSIZE){
            bufferGroups.focus.buffer.shift();
        }
        updateMetrics();
    });

    return true;
}

updateMetrics = () => {
    for (const key in bufferGroups) {
        if (Object.hasOwnProperty.call(bufferGroups, key)) {
            const element = bufferGroups[key];
            element.average = element.buffer.reduce((a, b) => a + b, 0) / element.buffer.length;
            // get the max value of the buffer
            var max = Math.max(...element.buffer);
            var min = Math.min(...element.buffer);
            
            // normalise the value
            element.normalised = (element.lastValue - min) / (max - min);

            // normalise the average
            max = Math.max(...element.buffer);
            min = Math.min(...element.buffer);
            element.normalisedAverage = (element.average - min) / (max - min);

            // calculate the trend as linear regression slope
            if(element.buffer.length > 1){
                var sumX = 0;
                var sumY = 0;
                var sumXY = 0;
                var sumXX = 0;
                var sumYY = 0;
                for (let i = 0; i < element.buffer.length; i++) {
                    sumX += i;
                    sumY += element.buffer[i];
                    sumXY += i * element.buffer[i];
                    sumXX += i * i;
                    sumYY += element.buffer[i] * element.buffer[i];
                }
                element.trend = (element.buffer.length * sumXY - sumX * sumY) / (element.buffer.length * sumXX - sumX * sumX);
            } else {
                element.trend = 0;
            }
        }
    }
};

async function streamUDP() {

    
    // send every second the data
    setInterval(() => {

        // build message
        var dataStr = "";
        for (const key in bufferGroups) {
            if (Object.hasOwnProperty.call(bufferGroups, key)) {
                const element = bufferGroups[key];
                dataStr += 'neuro.'+key+'.raw '+element.lastValue.toFixed(6) + '; neuro.'+key+'.average '+element.average.toFixed(6) + '; neuro.'+key+'.normalised '+element.normalised.toFixed(6) + '; neuro.'+element.label+'.normalised.average '+element.normalisedAverage.toFixed(6)+'; neuro.'+element.label+'.trend '+element.trend.toFixed(6)+';';
            }
        }

        let split = dataStr.split(';');
        split = split.filter(function (el) {
            console.log(el);
        });

        const message = Buffer.from(dataStr);

        const ip = TARGET_IP || MULTI_CAST_ADDRESS;
        socket.send(message, 0, message.length, PORT, ip, (err) => {
            if (err) {
                console.error('Broadcast error:', err)
                socket.close()
                clearInterval(broadcastInterval)
            }
        });
    },1000);


}

// logout on exit
process.on("exit", async () => {
    await neurosity.logout();
    console.log("Logged out");
    clearInterval(keepAlive);
});
