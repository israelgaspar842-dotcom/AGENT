// server.js — Backend que consulta DynamoDB (LocalStack)
// Ejecutar con: node server.js

import express from "express";
import cors from "cors";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const app  = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const client = new DynamoDBClient({
  region: "us-east-1",
  endpoint: "http://localhost:4566",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});
const db = DynamoDBDocumentClient.from(client);

// GET /taxista/:id  →  devuelve datos del taxista
app.get("/taxista/:id", async (req, res) => {
  try {
    const result = await db.send(new GetCommand({
      TableName: "taxistas",
      Key: { id: req.params.id },
    }));

    if (!result.Item) {
      return res.status(404).json({ error: "Taxista no encontrado" });
    }

    res.json(result.Item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al consultar la base de datos" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
  console.log(`   Prueba: http://localhost:${PORT}/taxista/TX001`);
});