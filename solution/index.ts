import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { users, posts, userPostsTable, comments, userSettings } from "./schema";
import * as schema from "./schema";
import { eq, asc, desc, type InferInsertModel, lt, gt, sql } from "drizzle-orm";

const client = createClient({ url: process.env.SOLUTION_DB_FILE_NAME! });
export const db = drizzle(client, {
  schema,
  logger: true,
});

//* Selects

// Basic Select
const getUser = async (id: string) => {
  // Select statements always return an array, so indexing the first element is a common pattern when only selecting one row
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
};

// Partial Select
const getUserName = async (id: string) => {
  const [userName] = await db
    .select({
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, id));
  return userName.name;
};

// Ordering
const getPostsAlphabetically = async () => {
  const sortedPosts = db
    .select()
    .from(posts)
    .orderBy(asc(posts.title), asc(posts.id)); // If two posts have the same title, order by id, ensuring a deterministic order
  return sortedPosts;
};

// Limit and Offset
const getPostsPaginated = async (page: number, pageSize: number) => {
  const paginatedPosts = db
    .select()
    .from(posts)
    .orderBy(desc(posts.createdAt))
    .limit(pageSize)
    .offset(page * pageSize);
  return paginatedPosts;
};

// Optimized Limit and Offset by using Keyset Pagination
const getPostsPaginatedOptimized = async (
  pageSize: number,
  after: number | undefined,
) => {
  const paginatedPosts = db
    .select()
    .from(posts)
    .where(after ? lt(posts.createdAt, after) : undefined)
    .orderBy(desc(posts.createdAt))
    .limit(pageSize);
  return paginatedPosts;
};

//* Inserts and Updates

// Basic Insert with returning
const insertUser = async (newUser: InferInsertModel<typeof users>) => {
  const [insertedUser] = await db.insert(users).values(newUser).returning();
  return insertedUser;
};

// Update
const changeEmail = async (id: string, newEmail: string) => {
  const [updatedUser] = await db
    .update(users)
    .set({ email: newEmail }) // Specify the columns to update
    .where(eq(users.id, id))
    .returning();
  return updatedUser;
};

// Upsert
// A user settings object may already exist, or may not depending on the application implementation
const setOrUpdateSettings = async (userId: string, theme: "light" | "dark") => {
  const [settings] = await db
    .insert(userSettings)
    .values({
      userId,
      theme,
    })
    .onConflictDoUpdate({ target: [userSettings.userId], set: { theme } })
    .returning();
  return settings;
};

// Batch Insert
// Simply pass in an array of users to insert instead of a single user
const insertUsers = async (newUsers: InferInsertModel<typeof users>[]) => {
  const insertedUsers = await db.insert(users).values(newUsers).returning();
  return insertedUsers;
};

// Update without fetching the updated row
const recordPostView = async (postId: string) => {
  return db
    .update(posts)
    .set({ views: sql`${posts.views} + 1` })
    .where(eq(posts.id, postId))
    .returning();
};

//* Delete
const deleteUser = async (id: string) => {
  const [deletedUser] = await db
    .delete(users)
    .where(eq(users.id, id))
    .returning();
  return deletedUser;
};

//* Joins

// Left and Right Joins
const getPostWithComments = async (postId: string) => {
  const postWithComments = await db
    .select()
    .from(posts)
    .leftJoin(comments, eq(posts.id, comments.postId))
    .where(eq(posts.id, postId));
  return postWithComments;
};

// Inner Join
// Select only the users that have settings associated with them
const usersWithSettings = async () => {
  const usersWithSettings = await db
    .select()
    .from(users)
    .innerJoin(userSettings, eq(users.id, userSettings.userId));
  return usersWithSettings;
};

// Many to many join
const getPostsByUser = async (userId: string) => {
  const postsByUser = await db
    .select()
    .from(userPostsTable)
    .innerJoin(posts, eq(userPostsTable.postId, posts.id))
    .innerJoin(users, eq(userPostsTable.userId, users.id))
    .where(eq(users.id, userId));

  return postsByUser;
};

//* Queries
const getPostWithCommentsQuery = async (postId: string) => {
  const postsWithComments = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
    with: {
      comments: true,
    },
  });
  return postsWithComments;
};

//* Transaction Example

//* Aggregations
// Summing up the views of all posts created in the past day

// Getting a count of the total number of posts created in the past week, use drizzle $count operator: https://orm.drizzle.team/docs/select#count
const usersSignedUpPastWeek = async () => {
  const count = await db.$count(
    posts,
    gt(posts.createdAt, Date.now() - 7 * 24 * 60 * 60 * 1000),
  );
  return count;
};

//
