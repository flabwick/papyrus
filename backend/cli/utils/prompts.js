const readline = require('readline');

/**
 * CLI Prompt Utilities
 */

/**
 * Create readline interface
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Prompt for password input (hidden)
 */
function promptPassword(message) {
  return new Promise((resolve) => {
    const rl = createInterface();
    
    // Hide input for password
    rl.stdoutMuted = true;
    rl._writeToOutput = function(stringToWrite) {
      if (rl.stdoutMuted) {
        rl.output.write('*');
      } else {
        rl.output.write(stringToWrite);
      }
    };

    rl.question(message, (password) => {
      rl.close();
      console.log(); // Add newline after password input
      resolve(password);
    });
  });
}

/**
 * Prompt for confirmation (y/n)
 */
function confirmAction(message) {
  return new Promise((resolve) => {
    const rl = createInterface();
    
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Prompt for text input
 */
function promptText(message, defaultValue = '') {
  return new Promise((resolve) => {
    const rl = createInterface();
    
    const prompt = defaultValue ? `${message} (${defaultValue}): ` : `${message}: `;
    
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Prompt for selection from a list
 */
function promptSelect(message, choices) {
  return new Promise((resolve) => {
    const rl = createInterface();
    
    console.log(message);
    choices.forEach((choice, index) => {
      console.log(`  ${index + 1}. ${choice}`);
    });
    
    const promptMessage = `Enter your choice (1-${choices.length}): `;
    
    const askForChoice = () => {
      rl.question(promptMessage, (answer) => {
        const choice = parseInt(answer);
        
        if (isNaN(choice) || choice < 1 || choice > choices.length) {
          console.log('Invalid choice. Please try again.');
          askForChoice();
        } else {
          rl.close();
          resolve(choices[choice - 1]);
        }
      });
    };
    
    askForChoice();
  });
}

/**
 * Prompt for multiple text inputs
 */
function promptMultiple(prompts) {
  return new Promise(async (resolve) => {
    const results = {};
    
    for (const [key, message, defaultValue] of prompts) {
      results[key] = await promptText(message, defaultValue);
    }
    
    resolve(results);
  });
}

module.exports = {
  promptPassword,
  confirmAction,
  promptText,
  promptSelect,
  promptMultiple
};