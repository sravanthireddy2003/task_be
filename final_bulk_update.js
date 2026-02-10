#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Main replacements for all remaining controllers
const files = [
  'src/controllers/ClientsApi.js',
  'src/controllers/documentController.js',
  'src/controllers/employeeController.js',
  'src/controllers/adminController.js',
  'src/controllers/notificationController.js',
  'src/controllers/auditController.js'
];

// Generic replacements that work across all files
const genericReplacements = [
  // Server errors  
  [/res\.status\(500\)\.json\(\{ success: false, error: e\.message \}\)/g,
   "res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message }))"],
  
  [/res\.status\(500\)\.json\(\{ success: false, error: (err?.message) \}\)/g,
   "res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: $1 }))"],
  
  [/res\.status\(500\)\.json\(\{ success: false, error: error\.message \}\)/g,  
   "res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: error.message }))"],
  
  // Generic 400/404 errors with 'error' field
  [/return res\.status\(400\)\.json\(\{ success: false, error: '([^']+)' \}\);/g,
   "return res.status(400).json(errorResponse.badRequest('$1', 'BAD_REQUEST'));"],
  
  [/return res\.status\(403\)\.json\(\{ success: false, error: '([^']+)' \}\);/g,
   "return res.status(403).json(errorResponse.forbidden('$1', 'FORBIDDEN'));"],
  
  [/return res\.status\(404\)\.json\(\{ success: false, error: '([^']+)' \}\);/g,
   "return res.status(404).json(errorResponse.notFound('$1', 'NOT_FOUND'));"],
  
  [/return res\.status\(409\)\.json\(\{ success: false, error: '([^']+)' \}\);/g,
   "return res.status(409).json(errorResponse.conflict('$1', 'CONFLICT'));"],
  
  // Errors with 'message' field (also common)
  [/return res\.status\(400\)\.json\(\{ success: false, message: '([^']+)' \}\);/g,
   "return res.status(400).json(errorResponse.badRequest('$1', 'BAD_REQUEST'));"],
  
  [/return res\.status\(403\)\.json\(\{ success: false, message: '([^']+)' \}\);/g,
   "return res.status(403).json(errorResponse.forbidden('$1', 'FORBIDDEN'));"],
  
  [/return res\.status\(404\)\.json\(\{ success: false, message: '([^']+)' \}\);/g,
   "return res.status(404).json(errorResponse.notFound('$1', 'NOT_FOUND'));"],
  
  [/if \(!([^)]+)\) return res\.status\(400\)\.json\(\{ success: false, error: '([^']+)' \}\);/g,
   "if (!$1) return res.status(400).json(errorResponse.badRequest('$2', 'BAD_REQUEST'));"],
  
  [/if \(!([^)]+)\) return res\.status\(404\)\.json\(\{ success: false, error: '([^']+)' \}\);/g,
   "if (!$1) return res.status(404).json(errorResponse.notFound('$2', 'NOT_FOUND'));"],
  
  [/if \(!([^)]+)\) return res\.status\(403\)\.json\(\{ success: false, error: '([^']+)' \}\);/g,
   "if (!$1) return res.status(403).json(errorResponse.forbidden('$2', 'FORBIDDEN'));"],
];

let totalChanges = 0;

files.forEach(filePath => {
  const fullPath = path.resolve(filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  ${filePath} - not found`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf-8');
  let fileChanges = 0;
  
  genericReplacements.forEach(([pattern, replacement]) => {
    const matches = content.match(pattern);
    if (matches) {
      content = content.replace(pattern, replacement);
      fileChanges += matches.length;
    }
  });
  
  if (fileChanges > 0) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`✓ ${filePath}: ${fileChanges} replacements`);
    totalChanges += fileChanges;
  } else {
    console.log(`- ${filePath}: no changes needed`);
  }
});

console.log(`\n✅ Total replacements: ${totalChanges}`);
