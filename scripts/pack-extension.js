/**
 * pack-extension.js
 * Empaqueta la carpeta /extension en un archivo .zip listo para instalar en Chrome.
 * 
 * Uso:
 *   node scripts/pack-extension.js
 * 
 * Genera:  metacloser-crm-extension.zip  en la raíz del proyecto.
 * 
 * Para instalar en Chrome:
 *   1. Descomprime el .zip en una carpeta local
 *   2. Abre Chrome → chrome://extensions
 *   3. Activa "Modo desarrollador" (toggle arriba a la derecha)
 *   4. Haz clic en "Cargar descomprimida" y selecciona la carpeta descomprimida
 *   -- O directamente arrastra el .zip a chrome://extensions --
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const EXT_DIR   = path.join(ROOT, 'extension');
const OUT_FILE  = path.join(ROOT, 'metacloser-crm-extension.zip');

// Files to include in the extension package
const INCLUDE_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'facebook-content.js',
  'popup.html',
  'popup.js',
  'styles.css',
];

console.log('\n🚀 MetaCloser CRM – Empaquetador de Extensión Chrome\n');

// Verify all required files exist
let missingFiles = [];
for (const file of INCLUDE_FILES) {
  const fullPath = path.join(EXT_DIR, file);
  if (!fs.existsSync(fullPath)) {
    missingFiles.push(file);
  }
}

if (missingFiles.length > 0) {
  console.error('❌ Archivos faltantes en /extension:\n  -', missingFiles.join('\n  - '));
  process.exit(1);
}

// Remove old zip if it exists
if (fs.existsSync(OUT_FILE)) {
  fs.unlinkSync(OUT_FILE);
  console.log('🗑️  Eliminado zip anterior');
}

// Use PowerShell Compress-Archive via spawnSync (avoids nested quote escaping)
import { spawnSync } from 'child_process';

try {
  const result = spawnSync('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Compress-Archive -Path '${EXT_DIR}\\*' -DestinationPath '${OUT_FILE}' -Force`
  ], { stdio: 'inherit', shell: false });

  if (result.status !== 0) {
    throw new Error(`PowerShell exited with code ${result.status}`);
  }

  const stats = fs.statSync(OUT_FILE);
  const sizeMB = (stats.size / 1024).toFixed(1);

  console.log(`\n✅ ¡Extensión empaquetada con éxito!`);
  console.log(`📦 Archivo: ${OUT_FILE}`);
  console.log(`📏 Tamaño:  ${sizeMB} KB`);
  console.log('\n📋 Pasos para instalar en Chrome:');
  console.log('   1. Abre Chrome → chrome://extensions');
  console.log('   2. Activa "Modo desarrollador" (toggle arriba a la derecha)');
  console.log('   3. Haz clic en "Cargar descomprimida" y selecciona la carpeta extension/');
  console.log('      -- O arrastra el .zip directamente a chrome://extensions --');
  console.log('\n   💡 Si ya la tenías instalada, recarga la extensión en chrome://extensions\n');
} catch (err) {
  console.error('❌ Error al empaquetar:', err.message);
  console.log('\n💡 Alternativa manual:');
  console.log(`   1. Ve a la carpeta: ${EXT_DIR}`);
  console.log('   2. Selecciona todos los archivos → clic derecho → "Enviar a → Carpeta comprimida"');
  console.log('   3. Arrastra el .zip a chrome://extensions con "Modo desarrollador" activo');
  process.exit(1);
}
