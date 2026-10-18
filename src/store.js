const fs = require('fs');
const path = require('path');

// Off-chain data: accounts, poll metadata and the participation list.
// Votes themselves live only on the blockchain.
class Store {
  constructor(file) {
    this.file = file;
    this.data = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : { users: [], polls: [], participation: [], leads: [] };
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  get users() { return this.data.users; }
  get polls() { return this.data.polls; }
  get participation() { return this.data.participation; }
  get leads() { return this.data.leads; }
}

module.exports = { Store };
