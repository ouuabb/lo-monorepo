const chalk = require("chalk");

class Logger {
  static info(msg, ...args) {
    console.log(`${chalk.blue("[info]")} ${msg}`, ...args);
  }

  static success(msg, ...args) {
    console.log(`${chalk.green("[ok]")} ${msg}`, ...args);
  }

  static warn(msg, ...args) {
    console.log(`${chalk.yellow("[warn]")} ${msg}`, ...args);
  }

  static error(msg, ...args) {
    console.log(`${chalk.red("[err]")} ${msg}`, ...args);
  }

  static table(data) {
    console.table(data);
  }

  static title(msg) {
    console.log(`\n${chalk.bold.cyan(msg)}`);
    console.log(chalk.gray("-".repeat(msg.length + 4)));
  }
}

module.exports = Logger;
