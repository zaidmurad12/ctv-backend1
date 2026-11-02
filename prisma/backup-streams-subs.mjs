import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
const p = new PrismaClient();
const streams = await p.stream.findMany();
const subtitles = await p.subtitle.findMany();
const out = process.argv[2];
fs.writeFileSync(out, JSON.stringify({ streams, subtitles }, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
console.log({ streams: streams.length, subtitles: subtitles.length, file: out });
await p.$disconnect();
