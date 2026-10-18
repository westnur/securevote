const fs = require('fs');
const path = require('path');

// Off-chain data: accounts, poll metadata and the list of who received ballots.
// Votes themselves live only on the blockchain.
class Store {
  constructor(file) {
    this.file = file;
    this.data = { org: null, users: [], polls: [], participation: [], leads: [], imports: [] };
    if (fs.existsSync(file)) Object.assign(this.data, JSON.parse(fs.readFileSync(file, 'utf8')));
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
