const http = require("http");

function postRequest(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path: path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log("--- TEST 1: Preguntando por catálogo / fotos ---");
  const r1 = await postRequest("/api/ai/live-chat", {
    lead: { name: "Christian", channel: "Marketplace" },
    userMessage: "buenas tardes donde puedo ver el catalogo completo o fotos de sus cocinas",
    product: null,
  });
  console.log("Respuesta 1:\n", r1.data?.replyText || r1.data?.respuesta_generada);

  console.log("\n--- TEST 2: Preguntando precio de estufa 4 quemadores con horno (slang + web product) ---");
  const r2 = await postRequest("/api/ai/live-chat", {
    lead: { name: "Santiago", channel: "Marketplace" },
    userMessage: "k precio la estufa de 4 quemadores con horno xfa",
    product: { name: "Estufa Industrial 4 Quemadores con Horno", price: "750" },
  });
  console.log("Respuesta 2:\n", r2.data?.replyText || r2.data?.respuesta_generada);

  console.log("\n--- TEST 3: Preguntando por freidora 2 canastas ---");
  const r3 = await postRequest("/api/ai/live-chat", {
    lead: { name: "Maritza", channel: "Marketplace" },
    userMessage: "buenas tienen la freidora de dos canastillas cuanto cuesta",
    product: { name: "Freidora de Alto Rendimiento 2 Canastas", price: "450" },
  });
  console.log("Respuesta 3:\n", r3.data?.replyText || r3.data?.respuesta_generada);
}

run();
