/** Creates a project whose interview waits on the review step, and prints SLUG=<slug>. Used by the AI review test. */
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { users } from "../src/lib/db/schema";
import { saveAnswers } from "../src/lib/interviews/service";
import { startProject } from "../src/lib/projects/service";

(async () => {
  const [u] = await db.select().from(users).where(eq(users.email, "owner@example.test"));
  const owner = { id: u.id, name: u.name, email: u.email, image: null };
  const { slug } = await startProject(owner, { idea: "A shop for handmade candles" }, "id");
  await saveAnswers(owner, {
    slug,
    step: "review",
    confirm: [],
    patch: {
      objective: "Pengguna memasukkan alamat atau nama tempat.",
      audience: ["public"],
      features: ["integration"],
      databaseNeed: "no",
      developmentMode: "saqina",
      deployment: "saqina-vercel",
    },
  } as never);
  console.log(`SLUG=${slug}`);
  process.exit(0);
})();
