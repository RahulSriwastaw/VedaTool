import express from 'express';
const app = express();
app.post("/api/test-keepalive", (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');
  const interval = setInterval(() => {
    res.write(' '); // send space
  }, 10000); // 10s

  setTimeout(() => {
    clearInterval(interval);
    res.write(JSON.stringify({ success: true }));
    res.end();
  }, 65000); // 65 seconds
});
const server = app.listen(3002, () => console.log("running 3002"));

setTimeout(() => {
  fetch('http://localhost:3002/api/test-keepalive', { method: 'POST' })
    .then(r => r.text())
    .then(t => {
      console.log("JSON parsed:", JSON.parse(t));
      server.close();
      process.exit(0);
    })
    .catch(e => {
      console.error(e);
      server.close();
      process.exit(1);
    });
}, 1000);
