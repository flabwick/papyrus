const FormDSLParser = require('./src/services/formDSLParser');

console.log('🧪 Testing Forms DSL Parser...\n');

// Test 1: Parse example form DSL
console.log('Test 1: Parsing example form DSL');
try {
  const exampleDSL = FormDSLParser.createExampleForm();
  console.log('✅ Example DSL created successfully');
  
  const parsed = FormDSLParser.parseFormDSL(exampleDSL);
  console.log('✅ DSL parsed successfully');
  console.log(`   - Title: ${parsed.title}`);
  console.log(`   - Blocks: ${parsed.blocks.length}`);
  
  const defaultState = FormDSLParser.getDefaultFormState(parsed);
  console.log('✅ Default state generated');
  console.log(`   - State keys: ${Object.keys(defaultState).join(', ')}`);
  
} catch (error) {
  console.error('❌ Test 1 failed:', error.message);
}

// Test 2: Template variable resolution
console.log('\nTest 2: Template variable resolution');
try {
  const template = 'Hello {{name.value}}, your topic is {{topic.value}}!';
  const formState = {
    name: { value: 'John', type: 'textbox' },
    topic: { value: 'AI Research', type: 'textbox' }
  };
  
  const resolved = FormDSLParser.resolveTemplateVariables(template, formState);
  console.log('✅ Template variables resolved');
  console.log(`   - Original: ${template}`);
  console.log(`   - Resolved: ${resolved}`);
  
} catch (error) {
  console.error('❌ Test 2 failed:', error.message);
}

// Test 3: Form validation
console.log('\nTest 3: Form validation');
try {
  const simpleDSL = `form:
  title: "Test Form"
  blocks:
    - block_type: "textbox"
      id: "required-field"
      label: "Required Field:"
      required: true
    
    - block_type: "textbox"
      id: "optional-field"
      label: "Optional Field:"
      required: false`;
  
  const parsed = FormDSLParser.parseFormDSL(simpleDSL);
  
  // Test with missing required field
  const invalidState = {
    'required-field': { value: '', type: 'textbox' },
    'optional-field': { value: 'Some value', type: 'textbox' }
  };
  
  const validation = FormDSLParser.validateFormState(parsed, invalidState);
  console.log('✅ Form validation completed');
  console.log(`   - Valid: ${validation.isValid}`);
  console.log(`   - Errors: ${validation.errors.length}`);
  console.log(`   - Warnings: ${validation.warnings.length}`);
  
} catch (error) {
  console.error('❌ Test 3 failed:', error.message);
}

// Test 4: Error handling
console.log('\nTest 4: Error handling');
try {
  const invalidDSL = `form:
  title: "Invalid Form"
  blocks:
    - block_type: "unknown_type"
      id: "test"`;
  
  FormDSLParser.parseFormDSL(invalidDSL);
  console.error('❌ Test 4 failed: Should have thrown error for invalid block type');
  
} catch (error) {
  console.log('✅ Error handling works correctly');
  console.log(`   - Error: ${error.message}`);
}

console.log('\n🎉 Forms DSL Parser tests completed!');
