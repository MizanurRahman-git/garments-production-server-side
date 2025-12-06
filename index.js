const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 3000;

// MiddleWare
app.use(express.json());
app.use(cors());

const verifyFBToken = (req, res, next) => {
    console.log('headers:', req.headers.authorization)
    next()
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@simple-crud-serv.sbd6kzc.mongodb.net/?appName=Simple-CRUD-Serv`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Garments-Production-Running....");
});

async function run() {
  try {
    await client.connect();
    const db = client.db("GarmentsPro");
    const userCollection = db.collection("users");



    app.post("/users", async (req, res) => {
      const user = req.body;
      user.status = "Panding";
      user.createdAt = new Date().toLocaleString();
      const email = user.email;
      const emailExist = await userCollection.findOne({ email });
      if (emailExist) {
        return res.send({ message: "Email Already Exist. Please Log in " });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });



    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
