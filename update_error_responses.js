#!/usr/bin/env node
/**
 * Script to update error response format across controllers
 * Converts old format { success: false, error: msg } to new errorResponse utility
 */

const fs = require('fs');
const path = require('path');

// Map of old patterns to new patterns
const replacements = [
  // Projects.js specific replacements
  {
    file: 'src/controllers/Projects.js',
    replacements: [
      {
        old: "return res.status(400).json({ success: false, message: 'projectName and clientPublicId are required' });",
        new: "return res.status(400).json(errorResponse.badRequest('projectName and clientPublicId are required', 'MISSING_REQUIRED_FIELDS', { required: ['projectName', 'clientPublicId'] }));"
      },
      {
        old: "return res.status(400).json({ success: false, message: 'clients table has no public_id column; provide numeric client id instead' });",
        new: "return res.status(400).json(errorResponse.badRequest('clients table has no public_id column; provide numeric client id instead', 'CLIENT_TABLE_ERROR'));"
      },
      {
        old: "return res.status(404).json({ success: false, message: 'Client not found' });",
        new: "return res.status(404).json(errorResponse.notFound('Client not found', 'CLIENT_NOT_FOUND'));"
      },
      {
        old: "return res.status(400).json({ success: false, message: 'Project manager not found' });",
        new: "return res.status(400).json(errorResponse.badRequest('Project manager not found', 'PROJECT_MANAGER_NOT_FOUND'));"
      },
      {
        old: "return res.status(400).json({ success: false, message: 'department_ids must be a non-empty array' });",
        new: "return res.status(400).json(errorResponse.badRequest('department_ids must be a non-empty array', 'INVALID_DEPARTMENT_IDS'));"
      },
      {
        old: "return res.status(404).json({ success: false, message: 'Project not found' });",
        new: "return res.status(404).json(errorResponse.notFound('Project not found', 'PROJECT_NOT_FOUND'));"
      },
      {
        old: "return res.status(403).json({ success: false, message: 'Access denied' });",
        new: "return res.status(403).json(errorResponse.forbidden('Access denied', 'ACCESS_DENIED'));"
      },
      {
        old: "res.status(500).json({ success: false, error: e.message });",
        new: "res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message }));"
      }
    ]
  }
];

/**
 * Replace all occurrences of a pattern in a file
 */
function replaceInFile(filePath, oldPattern, newPattern) {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.includes(oldPattern)) {
    return { success: false, message: `Pattern not found: ${oldPattern.substring(0, 50)}...` };
  }
  
  // Replace all occurrences
  let updated = content;
  const regex = new RegExp(oldPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  updated = updated.replace(regex, newPattern);
  
  if (updated === content) {
    return { success: false, message: 'No changes made' };
  }
  
  fs.writeFileSync(filePath, updated, 'utf-8');
  return { success: true, message: 'Updated' };
}

// Execute replacements
replacements.forEach(({ file, replacements: repl }) => {
  const filePath = path.resolve(file);
  console.log(`\n📁 Processing ${file}...`);
  
  repl.forEach(({ old, new: newVal }) => {
    const result = replaceInFile(filePath, old, newVal);
    const status = result.success ? '✓' : '✗';
    console.log(`  ${status} ${old.substring(0, 60)}...`);
  });
});

console.log('\n✅ Update complete!');
