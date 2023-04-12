"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// imports
const express_1 = __importDefault(require("express"));
const anchor_1 = require("@project-serum/anchor");
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const { PublicKey, Connection, clusterApiUrl, Keypair, TransactionMessage, VersionedTransaction } = anchor_1.web3;
// configs
dotenv_1.default.config();
const programId = new PublicKey('6DefpFdPkTfKUzjZrxN2kcsFfFv37DKimxdzAePhvp1S');
const idlPath = 'idl.json';
const port = process.env.PORT || 3000;
const app = (0, express_1.default)();
app.use(express_1.default.json());
// route handlers
app.get('/users', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const connection = new Connection(clusterApiUrl('devnet'));
        const accounts = yield connection.getProgramAccounts(programId, {
            dataSlice: {
                offset: 0,
                length: 0
            }
        });
        const program = getProgram();
        let users = [];
        let userDetails;
        for (let i = 0; i < accounts.length; ++i) {
            userDetails = (yield program.account.userDetails.fetch(accounts[i].pubkey));
            users.push({
                name: userDetails.name,
                age: Number(userDetails.age),
                address: userDetails.address,
                identity: userDetails.identity.toBase58()
            });
        }
        res.send({
            totalUsers: users.length,
            users
        });
    }
    catch (err) {
        res.status(500).send(`Could not process request: ${err}`);
    }
}));
app.get('/users/:addr', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userAddr = req.params.addr;
    if (!isValidAddress(userAddr)) {
        res.status(400).send('Invalid user address');
        return;
    }
    try {
        const [accountAddr] = PublicKey.findProgramAddressSync([Buffer.from('details'), new PublicKey(userAddr).toBuffer()], programId);
        const program = getProgram();
        let userDetails;
        try {
            userDetails = (yield program.account.userDetails.fetch(accountAddr));
        }
        catch (err) {
            res.status(404).send('No details have been saved for the specified address');
            return;
        }
        res.send({
            name: userDetails.name,
            age: Number(userDetails.age),
            address: userDetails.address,
            identity: userDetails.identity.toBase58()
        });
    }
    catch (err) {
        res.status(500).send(`Could not process request: ${err}`);
    }
}));
app.post('/users/:addr', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userAddr = req.params.addr;
    if (!isValidAddress(userAddr)) {
        res.status(400).send('Invalid user address');
        return;
    }
    const { name, age, address } = req.body;
    if (!name || !age || !address) {
        res.status(400).send('All three details (name, age, address) must be specified');
        return;
    }
    if (typeof name !== 'string' || typeof age !== 'number' || typeof address != 'string') {
        res.status(400).send('Details have invalid types');
        return;
    }
    if (name.length === 0 || age < 0 || address.length === 0) {
        res.status(400).send('Invalid details specified');
        return;
    }
    try {
        const [accountAddr] = PublicKey.findProgramAddressSync([Buffer.from('details'), new PublicKey(userAddr).toBuffer()], programId);
        const program = getProgram();
        const payer = getPayer();
        const ix = yield program.methods.storeDetails(name, new anchor_1.BN(age), address)
            .accounts({
            payer: payer.publicKey,
            user: new PublicKey(userAddr),
            details: accountAddr
        })
            .signers([payer])
            .instruction();
        const signature = yield sendTransation([ix]);
        res.send(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    }
    catch (err) {
        res.status(500).send(`Could not process request: ${err}`);
    }
    // prepare instruction
    // send transation
    // send response
}));
// server initiation
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
function getPayer() {
    var _a;
    const secret = JSON.parse((_a = process.env.PRIVATE_KEY) !== null && _a !== void 0 ? _a : '');
    const secretKey = Uint8Array.from(secret);
    return Keypair.fromSecretKey(secretKey);
}
function getProgram() {
    try {
        const idlString = fs_1.default.readFileSync(idlPath, 'utf-8');
        const idlObject = JSON.parse(idlString);
        const connection = new Connection(clusterApiUrl('devnet'));
        const wallet = new anchor_1.Wallet(getPayer());
        const provider = new anchor_1.AnchorProvider(connection, wallet, anchor_1.AnchorProvider.defaultOptions());
        return new anchor_1.Program(idlObject, programId, provider);
    }
    catch (err) {
        throw err;
    }
}
function sendTransation(instructions) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const connection = new Connection(clusterApiUrl('devnet'));
            const sender = getPayer();
            const blockhash = yield connection.getLatestBlockhash().then((res) => res.blockhash);
            const message = new TransactionMessage({
                payerKey: sender.publicKey,
                recentBlockhash: blockhash,
                instructions
            }).compileToV0Message();
            const tx = new VersionedTransaction(message);
            tx.sign([sender]);
            const signature = yield connection.sendTransaction(tx);
            return signature;
        }
        catch (err) {
            throw err;
        }
    });
}
function isValidAddress(input) {
    if (input.length < 32 || input.length > 44)
        return false;
    let asciiValue;
    for (let index = 0; index < input.length; index++) {
        asciiValue = input.charCodeAt(index);
        if (asciiValue > 47 && asciiValue < 58
            || asciiValue > 64 && asciiValue < 91
            || asciiValue > 96 && asciiValue < 123)
            continue;
        return false;
    }
    if (input.includes('0')
        || input.includes('I')
        || input.includes('O')
        || input.includes('l'))
        return false;
    return true;
}
