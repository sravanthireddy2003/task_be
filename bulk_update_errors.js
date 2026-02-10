#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Define all replacements for each controller
const controllerUpdates = {
  'src/controllers/Projects.js': [
    [/return res\.status\(400\)\.json\(\{ success: false, message: 'projectName and clientPublicId are required' \}\);/g,
     "return res.status(400).json(errorResponse.badRequest('projectName and clientPublicId are required', 'MISSING_REQUIRED_FIELDS'));"],
    
    [/return res\.status\(400\)\.json\(\{ success: false, message: 'clients table has no public_id column; provide numeric client id instead' \}\);/g,
     "return res.status(400).json(errorResponse.badRequest('clients table has no public_id column; provide numeric client id instead', 'CLIENT_TABLE_ERROR'));"],
    
    [/return res\.status\(404\)\.json\(\{ success: false, message: 'Client not found' \}\);/g,
     "return res.status(404).json(errorResponse.notFound('Client not found', 'CLIENT_NOT_FOUND'));"],
    
    [/return res\.status\(400\)\.json\(\{ success: false, message: 'Project manager not found' \}\);/g,
     "return res.status(400).json(errorResponse.badRequest('Project manager not found', 'PROJECT_MANAGER_NOT_FOUND'));"],
    
    [/return res\.status\(400\)\.json\(\{ success: false, message: 'department_ids must be a non-empty array' \}\);/g,
     "return res.status(400).json(errorResponse.badRequest('department_ids must be a non-empty array', 'INVALID_DEPARTMENT_IDS'));"],
    
    [/return res\.status\(404\)\.json\(\{ success: false, message: 'Project not found' \}\);/g,
     "return res.status(404).json(errorResponse.notFound('Project not found', 'PROJECT_NOT_FOUND'));"],
    
    [/return res\.status\(403\)\.json\(\{ success: false, message: 'Access denied' \}\);/g,
     "return res.status(403).json(errorResponse.forbidden('Access denied', 'ACCESS_DENIED'));"],
    
    [/res\.status\(500\)\.json\(\{ success: false, error: e\.message \}\);/g,
     "res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message }));"]
  ],
  
  'src/controllers/managerController.js': [
    [/res\.status\(400\)\.json\(\{ success: false, error: /g,
     "res.status(400).json(errorResponse.badRequest("],
    
    [/res\.status\(404\)\.json\(\{ success: false, message: '([^']+)' \}\);/g,
     "res.status(404).json(errorResponse.notFound('$1', 'NOT_FOUND'));"],
    
    [/res\.status\(500\)\.json\(\{ success: false, error: e\.message \}\);/g,
     "res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message }));"],
    
    [/res\.status\(400\)\.json\(\{ success: false, message: '([^']+)' \}\);/g,
     "res.status(400).json(errorResponse.badRequest('$1', 'VALIDATION_ERROR'));"]
  ]
};

Object.entries(controllerUpdates).forEach(([filePath, replacements]) => {
  const fullPath = path.resolve(filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf-8');
  let changeCount = 0;
  
  replacements.forEach(([pattern, replacement]) => {
    const matches = content.match(pattern);
    if (matches) {
      content = content.replace(pattern, replacement);
      changeCount += matches.length;
      console.log(`✓ ${filePath}: ${matches.length} replacements made`);
    }
  });
  
  if (changeCount > 0) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`  Total: ${changeCount} changes\n`);
  }
});

console.log('✅ Bulk replacements complete!');
