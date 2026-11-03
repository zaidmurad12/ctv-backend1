import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const s = await p.stream.deleteMany({});
const t = await p.subtitle.deleteMany({});
console.log({ streamsDeleted: s.count, subtitlesDeleted: t.count, streamsLeft: await p.stream.count(), subtitlesLeft: await p.subtitle.count() });
await p.$disconnect();
