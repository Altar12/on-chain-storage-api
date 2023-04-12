// imports
import express from 'express';
import { Program, Idl, AnchorProvider, web3, BN, Wallet } from '@project-serum/anchor';
import dotenv from 'dotenv';
import idl from './idl.json';
const { PublicKey, Connection, clusterApiUrl, Keypair, TransactionMessage, VersionedTransaction } = web3;

// configs
dotenv.config();
const programId = new PublicKey(idl.metadata.address);
const port = process.env.PORT || 3000;
const app = express();
app.use(express.json());

// route handlers
app.get('/users', async (req, res) => {
    try {
        const connection = new Connection(clusterApiUrl('devnet'));
        const accounts = await connection.getProgramAccounts(programId, {
                                    dataSlice: {
                                        offset: 0,
                                        length: 0
                                    }
                        });
        const program = getProgram();
        let users: User[] = [];
        let userDetails: UserDetails;
        for (let i=0; i<accounts.length; ++i) {
            userDetails = await program.account.userDetails.fetch(accounts[i].pubkey) as UserDetails;
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
    } catch (err) {
        res.status(500).send(`Could not process request: ${err}`);
    }
});

app.get('/users/:addr', async (req, res) => {
    const userAddr = req.params.addr;
    if (!isValidAddress(userAddr)) {
        res.status(400).send('Invalid user address');
        return;
    }
    try {
        const [accountAddr] = PublicKey.findProgramAddressSync([Buffer.from('details'), new PublicKey(userAddr).toBuffer()], programId);
        const program = getProgram();
        let userDetails: UserDetails;
        try {
            userDetails = await program.account.userDetails.fetch(accountAddr) as UserDetails;
        } catch (err) {
            res.status(404).send('No details have been saved for the specified address');
            return;
        }
        res.send({
            name: userDetails.name,
            age: Number(userDetails.age),
            address: userDetails.address,
            identity: userDetails.identity.toBase58()
        });
    } catch (err) {
        res.status(500).send(`Could not process request: ${err}`);
    }
});

app.post('/users/:addr', async (req, res) => {
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
        const ix = await program.methods.storeDetails(name, new BN(age), address)
                                        .accounts({
                                            payer: payer.publicKey,
                                            user: new PublicKey(userAddr),
                                            details: accountAddr
                                        })
                                        .signers([payer])
                                        .instruction();
        const signature = await sendTransation([ix]);
        res.send(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    } catch (err) {
        res.status(500).send(`Could not process request: ${err}`);
    }
    // prepare instruction
    // send transation
    // send response
});

// server initiation
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
})

// helper functions/types
type UserDetails = {
    name: string,
    age: BN,
    address: string,
    identity: web3.PublicKey
};

type User = {
    name: string,
    age: number,
    address: string,
    identity: string
}

function getPayer(): web3.Keypair {
    const secret = JSON.parse(process.env.PRIVATE_KEY ?? '');
    const secretKey = Uint8Array.from(secret);
    return Keypair.fromSecretKey(secretKey);
}

function getProgram(): Program {
    const connection = new Connection(clusterApiUrl('devnet'));
    const wallet = new Wallet(getPayer());
    const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
    return new Program(idl as Idl, programId, provider);
}

async function sendTransation(instructions: web3.TransactionInstruction[]): Promise<string> {
    try {
        const connection = new Connection(clusterApiUrl('devnet'));
        const sender = getPayer();
        const blockhash = await connection.getLatestBlockhash().then((res) => res.blockhash);
        const message = new TransactionMessage({
                            payerKey: sender.publicKey,
                            recentBlockhash: blockhash,
                            instructions
                        }).compileToV0Message();
        const tx = new VersionedTransaction(message);
        tx.sign([sender]);
        const signature = await connection.sendTransaction(tx);
        return signature;
    } catch (err) {
        throw err;
    }
}

function isValidAddress(input: string): boolean {
    if (input.length < 32 || input.length > 44)
      return false;
    let asciiValue: number;
    for (let index=0; index<input.length; index++) {
      asciiValue = input.charCodeAt(index);
      if (asciiValue>47 && asciiValue<58
          || asciiValue>64 && asciiValue<91
          || asciiValue>96 && asciiValue<123)
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