import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import mqtt from 'mqtt';
import { format } from 'date-fns';

const app = express();
app.use(express.json());

const PORT = 3000;

// Set up Brokers
const brokersConfig = [
  {
    id: 'mosquitto-public',
    name: 'Mosquitto Pub',
    url: 'mqtt://test.mosquitto.org:1883',
    options: { clientId: `mqttjs_pub_${Math.random().toString(16).slice(2, 8)}`, reconnectPeriod: 5000 },
  },
  {
    id: 'flespi',
    name: 'Flespi',
    url: 'mqtt://mqtt.flespi.io:1883',
    options: {
      clientId: `mqttjs_flespi_${Math.random().toString(16).slice(2, 8)}`,
      username: 'G68ycRF9Y051H0GMWLNXBmHKzucfa7aocPeH1hPtcQyZyGE8ukxaUbAwE3N0RuSe',
      password: '',
      reconnectPeriod: 5000,
    },
  },
  {
    id: 'mosquitto-auth',
    name: 'Mosquitto Auth',
    url: 'mqtt://test.mosquitto.org:1884',
    options: {
      clientId: `mqttjs_auth_${Math.random().toString(16).slice(2, 8)}`,
      username: 'rw',
      password: 'readwrite',
      reconnectPeriod: 5000,
    },
  },
];

// Active clients and statuses
const mqttClients: Record<string, mqtt.MqttClient> = {};
const statuses: Record<string, string> = {
  'mosquitto-public': 'Connecting...',
  'flespi': 'Connecting...',
  'mosquitto-auth': 'Connecting...',
};

// SSE connections
let sseClients: any[] = [];

// Helper to push updates to the UI
const sendEvent = (type: string, data: any) => {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    client.write(payload);
  });
};

// Initialize MQTT Clients
brokersConfig.forEach((b) => {
  console.log(`Connecting to ${b.name} (${b.url})...`);
  const client = mqtt.connect(b.url, b.options);
  mqttClients[b.id] = client;

  client.on('connect', () => {
    statuses[b.id] = 'Connected';
    sendEvent('status', statuses);
    console.log(`[${b.id}] Connected`);
  });

  client.on('error', (err) => {
    statuses[b.id] = `Error: ${err.message}`;
    sendEvent('status', statuses);
    console.error(`[${b.id}] Error: ${err.message}`);
  });

  client.on('offline', () => {
    statuses[b.id] = 'Offline';
    sendEvent('status', statuses);
    console.log(`[${b.id}] Offline`);
  });

  client.on('message', (topic, message) => {
    sendEvent('message', {
      id: Math.random().toString(36).substring(2, 9),
      brokerId: b.id,
      topic,
      payload: message.toString(),
      timestamp: new Date().toISOString(),
    });
  });
});

// SSE endpoint to stream live status and messages to React
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Immediately push the current connection states
  res.write(`event: status\ndata: ${JSON.stringify(statuses)}\n\n`);

  sseClients.push(res);
  req.on('close', () => {
    sseClients = sseClients.filter((c) => c !== res);
  });
});

app.post('/api/config/flespi', (req, res) => {
  const { token } = req.body;
  if (token === undefined) return res.status(400).json({ error: 'Token is required' });

  const b = brokersConfig.find(b => b.id === 'flespi');
  if (b) {
    b.options.username = token.trim();
    
    // Disconnect old client
    if (mqttClients['flespi']) {
      mqttClients['flespi'].end(true);
    }

    statuses['flespi'] = 'Connecting...';
    sendEvent('status', statuses);

    console.log(`Reconnecting Flespi with new token...`);
    const client = mqtt.connect(b.url, b.options);
    mqttClients['flespi'] = client;

    client.on('connect', () => {
      statuses['flespi'] = 'Connected';
      sendEvent('status', statuses);
      console.log(`[flespi] Connected`);
    });

    client.on('error', (err) => {
      statuses['flespi'] = `Error: ${err.message}`;
      sendEvent('status', statuses);
      console.error(`[flespi] Error: ${err.message}`);
    });

    client.on('offline', () => {
      statuses['flespi'] = 'Offline';
      sendEvent('status', statuses);
      console.log(`[flespi] Offline`);
    });

    client.on('message', (topic, message) => {
      sendEvent('message', {
        id: Math.random().toString(36).substring(2, 9),
        brokerId: 'flespi',
        topic,
        payload: message.toString(),
        timestamp: new Date().toISOString(),
      });
    });

    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Flespi configuration not found' });
  }
});

app.post('/api/subscribe', (req, res) => {
  const { brokerId, topic } = req.body;
  if (!topic) return res.status(400).json({ error: 'Topic is required' });

  const client = mqttClients[brokerId];
  if (client) {
    client.subscribe(topic, (err) => {
      if (!err) res.json({ success: true });
      else res.status(500).json({ error: err.message });
    });
  } else {
    res.status(404).json({ error: 'Broker not found' });
  }
});

app.post('/api/publish', (req, res) => {
  const { brokerId, topic, message } = req.body;
  if (!topic) return res.status(400).json({ error: 'Topic is required' });

  const client = mqttClients[brokerId];
  if (client) {
    client.publish(topic, message || '', {}, (err) => {
      if (!err) res.json({ success: true });
      else res.status(500).json({ error: err.message });
    });
  } else {
    res.status(404).json({ error: 'Broker not found' });
  }
});

app.get('/api/brokers', (req, res) => {
  res.json(brokersConfig.map((b) => ({ id: b.id, name: b.name, url: b.url })));
});

// Vite & Express Integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
