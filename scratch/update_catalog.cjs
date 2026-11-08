const fs = require("fs");
const path = require("path");

const prodPath = path.join(__dirname, "../src/data/local-products.json");
let products = JSON.parse(fs.readFileSync(prodPath, "utf-8"));

// Update mesa_150
const mesa = products.find(p => p.id === "prod_mesa_150");
if (mesa) {
  mesa.price = 150;
  mesa.websiteUrl = "https://amecocinas.com/";
  mesa.tagline = "Mesa de trabajo lisa en acero inoxidable 1.50m - Precio web oficial";
}

// Add or update the official web products
const webProducts = [
  {
    id: "prod_estufa_4q_horno",
    name: "Estufa Industrial 4 Quemadores con Horno",
    category: "Cocción",
    price: 750,
    currency: "USD",
    tagline: "Alta potencia gastronómica con horno integrado de alta retención térmica",
    description: "Estufa industrial completa con 4 quemadores macizos de hierro fundido y horno en acero inoxidable.",
    features: [
      "Fabricación 100% acero inoxidable T-304 grado alimenticio",
      "4 quemadores de hierro fundido de alto rendimiento",
      "Horno industrial con termostato y capacidad para charolas estándar",
      "Bandeja recolectora de derrames desmontable",
      "Catálogo oficial web https://amecocinas.com/"
    ],
    stockStatus: "entrega_inmediata",
    websiteUrl: "https://amecocinas.com/",
    imageUrl: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "prod_freidora_2canastas",
    name: "Freidora de Alto Rendimiento 2 Canastas",
    category: "Freidoras Industriales",
    price: 450,
    currency: "USD",
    tagline: "20 Litros a gas para fritura rápida y crujiente",
    description: "Freidora industrial de 20 litros con 2 canastas niqueladas de alta durabilidad y tiro rápido.",
    features: [
      "Tina en acero inoxidable T-304 de fácil drenaje",
      "2 canastillas niqueladas con mango atérmico",
      "Capacidad de 20 litros con alta recuperación térmica",
      "Catálogo oficial web https://amecocinas.com/"
    ],
    stockStatus: "entrega_inmediata",
    websiteUrl: "https://amecocinas.com/",
    imageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "prod_campana_pared_2m",
    name: "Campana Extractora de Pared 2m",
    category: "Ventilación",
    price: 600,
    currency: "USD",
    tagline: "2.00 metros con filtros laberinto atrapagrasa lavables",
    description: "Campana extractora de pared en acero inoxidable de 2 metros con canal recolector de grasa.",
    features: [
      "Filtros laberinto desmontables y lavables en acero inox",
      "Canal perimetral recolector de condensados y grasas",
      "Medida estándar: 2.00 metros lineales",
      "Catálogo oficial web https://amecocinas.com/"
    ],
    stockStatus: "entrega_inmediata",
    websiteUrl: "https://amecocinas.com/",
    imageUrl: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "prod_horno_conveccion_4ch",
    name: "Horno de Convección Eléctrico Profesional",
    category: "Hornos Industriales",
    price: 1200,
    currency: "USD",
    tagline: "Cocción uniforme y homogénea con capacidad para 4 charolas",
    description: "Horno de convección profesional con ventilación forzada y control digital de temperatura.",
    features: [
      "Capacidad para 4 charolas gastronómicas",
      "Circulación de aire caliente envolvente para horneado parejo",
      "Puerta con doble vidrio templado para aislamiento térmico",
      "Catálogo oficial web https://amecocinas.com/"
    ],
    stockStatus: "entrega_inmediata",
    websiteUrl: "https://amecocinas.com/",
    imageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "prod_plancha_gas_coldrolled_1m",
    name: "Plancha a Gas Acero Cold Rolled 1m",
    category: "Cocción y Planchas",
    price: 390,
    currency: "USD",
    tagline: "Placa pesada cold rolled de 1 metro para hamburguesas y carnes",
    description: "Plancha industrial de 1 metro con placa de cold rolled de alta retención térmica y quemadores tubulares.",
    features: [
      "Plancha gruesa rectificada para calor uniforme",
      "Canal frontal y cajón recolector de residuos grasos",
      "Estructura en acero inoxidable de uso continuo",
      "Catálogo oficial web https://amecocinas.com/"
    ],
    stockStatus: "entrega_inmediata",
    websiteUrl: "https://amecocinas.com/",
    imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80"
  }
];

webProducts.forEach(wp => {
  const existingIdx = products.findIndex(p => p.id === wp.id);
  if (existingIdx >= 0) {
    products[existingIdx] = wp;
  } else {
    products.push(wp);
  }
});

// Also add websiteUrl to all existing products
products.forEach(p => {
  if (!p.websiteUrl) p.websiteUrl = "https://amecocinas.com/";
});

fs.writeFileSync(prodPath, JSON.stringify(products, null, 2), "utf-8");
console.log("Successfully updated local-products.json! Total products:", products.length);
