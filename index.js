const express = require("express");
const cors = require("cors");
// const { printer } = require("node-thermal-printer");
const app = express();

let processedIdList = [];
let printActionLogs = [];

const port = 5002;
const corsOptions = {
  origin: "*",
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));

const ThermalPrinter = require("node-thermal-printer").printer;
const PrinterTypes = require("node-thermal-printer").types;

function createPrinter(config) {
  if (!config.TCP_ADDRESS) {
    throw new Error("Printer TCP address is not defined.");
  }

  let width = 40;

  let printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: config.TCP_ADDRESS,
    width,
    characterSet: "PC857_TURKISH",
  });
  printer.DETAILS = config;

  return printer;
}

async function print(data) {
  try {
    const { printerConfig } = data;
    const printer = createPrinter(printerConfig);

    const buffer = Buffer.from(data.image.split(",")[1], "base64");
    await printer.printImageBuffer(buffer);

    printer.cut();
    await printer.execute();
    printer.beep();

    return { SUCCESS: true, id: data.id, data };
  } catch (error) {
    processedIdList = processedIdList.filter((item) => item !== data.id);
    throw error;
  }
}

let printQueue = [];
let isPrinting = false;

async function processQueue() {
  if (isPrinting || printQueue.length === 0) {
    return;
  }

  isPrinting = true;
  const printRequest = printQueue.shift();

  try {
    const result = await print(printRequest.data);
    printRequest.resolve(result);
  } catch (error) {
    console.log("res");
    console.log(error.message);
    printRequest.reject({
      data: printRequest.data,
      ERROR: true,
      errorMessage: error.message,
    });
  } finally {
    isPrinting = false;
    processQueue();
  }
}

app.listen(port, () => {
  console.log(`
    
██████╗ ██╗ ██████╗ ███╗   ██╗██████╗  ██████╗ ███████╗
██╔══██╗██║██╔═══██╗████╗  ██║██╔══██╗██╔═══██╗██╔════╝
██████╔╝██║██║   ██║██╔██╗ ██║██████╔╝██║   ██║███████╗
██╔═══╝ ██║██║   ██║██║╚██╗██║██╔═══╝ ██║   ██║╚════██║
██║     ██║╚██████╔╝██║ ╚████║██║     ╚██████╔╝███████║
╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝      ╚═════╝ ╚══════╝
                                                       

               PRINTER SERVER @2023
            
    `);

  console.log("Server running at", `localhost:${port}`);
});

app.get("/", (req, res) => {
  res.send("PIONPOS printer app server!");
});

app.post("/print", async (req, res) => {
  try {
    // console.log(req.body)
    if (processedIdList.includes(req.body.id)) {
      return;
    }

    processedIdList.push(req.body.id);
    processedIdList = processedIdList.slice(-10);

    const printRequest = {
      data: req.body,
    };

    const resultPromise = new Promise((resolve, reject) => {
      printRequest.resolve = resolve;
      printRequest.reject = reject;
    });

    printQueue.push(printRequest);
    processQueue();

    const result = await resultPromise;
    res.send(result);

    printActionLogs.push(result);
    printActionLogs = printActionLogs.slice(-10);
  } catch (error) {
    console.log("res");
    console.log(error.message);
    res.send({ data: req.body, ERROR: true, errorMessage: error.message });
  }
});

app.post("/test", async (req, res) => {
  try {
    if (!req.body.image) {
      throw new Error("could not find image.");
    }

    if (!req.body.printerConfig) {
      throw new Error("could not find printer");
    }

    const buffer = Buffer.from(req.body.image.split(",")[1], "base64");

    const result = await print({
      ...req.body,
      imgBuffer: buffer,
    });

    res.send(result);
  } catch (error) {
    console.log(error.message);
    res.send({ data: null, ERROR: true, errorMessage: error.message });
  }
});

app.post("/health-check", async (req, res) => {
  try {
    const printer = createPrinter(req.body);
    const printerConnected = await printer.isPrinterConnected(); // Check if printer is connected, return bool of status

    res.send({
      ...req.body,
      connected: printerConnected,
    });
  } catch (error) {
    console.log(error.message);
    res.send({
      ...req.body,
      connected: false,
      ERROR: true,
      errorMessage: error.message,
    });
  }
});
