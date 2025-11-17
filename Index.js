const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize database with Project Harmony schema
const initDB = async () => {
  try {
    await pool.query(`
      -- Table 1: User
      CREATE TABLE IF NOT EXISTS "User" (
          "UserID" SERIAL PRIMARY KEY,
          "Name" VARCHAR(255) NOT NULL,
          "Email" VARCHAR(255) UNIQUE NOT NULL,
          "Password_Hash" VARCHAR(255) NOT NULL,  
          "Role" VARCHAR(50) NOT NULL DEFAULT 'Member', 
          "Status" VARCHAR(50) NOT NULL DEFAULT 'Pending', 
          "Moderator_Expiry_Date" TIMESTAMPTZ, 
          "Legacy_Appointee_UserID" INT REFERENCES "User"("UserID") 
      );

      -- Table 2: Invite
      CREATE TABLE IF NOT EXISTS "Invite" (
          "InviteID" SERIAL PRIMARY KEY,
          "InvitedBy_UserID" INT NOT NULL REFERENCES "User"("UserID"),
          "Invitee_Email" VARCHAR(255) NOT NULL,
          "Status" VARCHAR(50) NOT NULL, 
          "Denial_Reason" TEXT,
          "Created_At" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      -- Table 3: Group
      CREATE TABLE IF NOT EXISTS "Group" (
          "GroupID" SERIAL PRIMARY KEY,
          "GroupName" VARCHAR(255) NOT NULL,
          "GroupType" VARCHAR(50) NOT NULL DEFAULT 'Secret', 
          "CreatedBy_UserID" INT NOT NULL REFERENCES "User"("UserID")
      );

      -- Table 4: Group_Member
      CREATE TABLE IF NOT EXISTS "Group_Member" (
          "GroupID" INT NOT NULL REFERENCES "Group"("GroupID") ON DELETE CASCADE,
          "UserID" INT NOT NULL REFERENCES "User"("UserID") ON DELETE CASCADE,
          PRIMARY KEY ("GroupID", "UserID") 
      );

      -- Table 5: Person (The Family Tree)
      CREATE TABLE IF NOT EXISTS "Person" (
          "PersonID" SERIAL PRIMARY KEY,
          "Name" VARCHAR(255) NOT NULL,
          "BirthDate" DATE,
          "DeathDate" DATE, 
          "Biography" TEXT, 
          "Profile_UserID" INT REFERENCES "User"("UserID") 
      );

      -- Table 6: Relationship (The Family Tree Logic)
      CREATE TABLE IF NOT EXISTS "Relationship" (
          "RelationshipID" SERIAL PRIMARY KEY,
          "Person1_ID" INT NOT NULL REFERENCES "Person"("PersonID"),
          "Person2_ID" INT NOT NULL REFERENCES "Person"("PersonID"),
          "RelationshipType" VARCHAR(50) NOT NULL 
      );

      -- Table 7: Media_Album
      CREATE TABLE IF NOT EXISTS "Media_Album" (
          "AlbumID" SERIAL PRIMARY KEY,
          "AlbumName" VARCHAR(255) NOT NULL,
          "Description" TEXT,
          "CreatedBy_UserID" INT NOT NULL REFERENCES "User"("UserID")
      );

      -- Table 8: Media_Item
      CREATE TABLE IF NOT EXISTS "Media_Item" (
          "ItemID" SERIAL PRIMARY KEY,
          "AlbumID" INT NOT NULL REFERENCES "Media_Album"("AlbumID") ON DELETE CASCADE,
          "UploadedBy_UserID" INT NOT NULL REFERENCES "User"("UserID"),
          "File_URL" VARCHAR(500) NOT NULL,
          "Description_Caption" TEXT,
          "Date_Taken" DATE,
          "Post_Status" VARCHAR(50) NOT NULL DEFAULT 'Visible' 
      );

      -- Table 9: Timeline_Event
      CREATE TABLE IF NOT EXISTS "Timeline_Event" (
          "EventID" SERIAL PRIMARY KEY,
          "EventDate" DATE NOT NULL,
          "Title" VARCHAR(255) NOT NULL,
          "Story" TEXT,
          "CreatedBy_UserID" INT NOT NULL REFERENCES "User"("UserID"),
          "Post_Status" VARCHAR(50) NOT NULL DEFAULT 'Visible' 
      );

      -- Table 10: Direct_Message
      CREATE TABLE IF NOT EXISTS "Direct_Message" (
          "MessageID" SERIAL PRIMARY KEY,
          "Sender_UserID" INT NOT NULL REFERENCES "User"("UserID"),
          "Recipient_UserID" INT NOT NULL REFERENCES "User"("UserID"),
          "Message_Content" TEXT NOT NULL,
          "Timestamp" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          "Message_Status" VARCHAR(50) NOT NULL DEFAULT 'Sent' 
      );

      -- Table 11: Memorial_Tribute
      CREATE TABLE IF NOT EXISTS "Memorial_Tribute" (
          "TributeID" SERIAL PRIMARY KEY,
          "Deceased_PersonID" INT NOT NULL REFERENCES "Person"("PersonID") ON DELETE CASCADE,
          "PostedBy_UserID" INT NOT NULL REFERENCES "User"("UserID"),
          "Tribute_Content" TEXT NOT NULL,
          "Timestamp" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          "Post_Status" VARCHAR(50) NOT NULL DEFAULT 'Visible' 
      );
    `);
    console.log('✅ Database initialized successfully with Project Harmony schema');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
};

initDB();

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Project Harmony API is running' });
});

// ============ USER ENDPOINTS ============
// Register new user
app.post('/api/users/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO "User" ("Name", "Email", "Password_Hash") VALUES ($1, $2, $3) RETURNING "UserID", "Name", "Email", "Role", "Status"',
      [name, email, hashedPassword]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT "UserID", "Name", "Email", "Role", "Status" FROM "User"');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ============ PERSON (FAMILY TREE) ENDPOINTS ============
// Get all people
app.get('/api/people', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "Person" ORDER BY "Name"');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching people:', error);
    res.status(500).json({ error: 'Failed to fetch people' });
  }
});

// Add person
app.post('/api/people', async (req, res) => {
  const { name, birthDate, deathDate, biography, profileUserId } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO "Person" ("Name", "BirthDate", "DeathDate", "Biography", "Profile_UserID") VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, birthDate, deathDate, biography, profileUserId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding person:', error);
    res.status(500).json({ error: 'Failed to add person' });
  }
});

// Update person
app.put('/api/people/:id', async (req, res) => {
  const { name, birthDate, deathDate, biography } = req.body;
  try {
    const result = await pool.query(
      'UPDATE "Person" SET "Name" = $1, "BirthDate" = $2, "DeathDate" = $3, "Biography" = $4 WHERE "PersonID" = $5 RETURNING *',
      [name, birthDate, deathDate, biography, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating person:', error);
    res.status(500).json({ error: 'Failed to update person' });
  }
});

// ============ RELATIONSHIP ENDPOINTS ============
// Get all relationships
app.get('/api/relationships', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "Relationship"');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching relationships:', error);
    res.status(500).json({ error: 'Failed to fetch relationships' });
  }
});

// Add relationship
app.post('/api/relationships', async (req, res) => {
  const { person1Id, person2Id, relationshipType } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO "Relationship" ("Person1_ID", "Person2_ID", "RelationshipType") VALUES ($1, $2, $3) RETURNING *',
      [person1Id, person2Id, relationshipType]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding relationship:', error);
    res.status(500).json({ error: 'Failed to add relationship' });
  }
});

// ============ TIMELINE EVENT ENDPOINTS ============
// Get all timeline events
app.get('/api/timeline', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "Timeline_Event" WHERE "Post_Status" = $1 ORDER BY "EventDate" DESC', ['Visible']);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// Add timeline event
app.post('/api/timeline', async (req, res) => {
  const { eventDate, title, story, createdByUserId } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO "Timeline_Event" ("EventDate", "Title", "Story", "CreatedBy_UserID") VALUES ($1, $2, $3, $4) RETURNING *',
      [eventDate, title, story, createdByUserId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding timeline event:', error);
    res.status(500).json({ error: 'Failed to add timeline event' });
  }
});

// ============ MEDIA ALBUM ENDPOINTS ============
// Get all albums
app.get('/api/albums', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "Media_Album"');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching albums:', error);
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
});

// Create album
app.post('/api/albums', async (req, res) => {
  const { albumName, description, createdByUserId } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO "Media_Album" ("AlbumName", "Description", "CreatedBy_UserID") VALUES ($1, $2, $3) RETURNING *',
      [albumName, description, createdByUserId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating album:', error);
    res.status(500).json({ error: 'Failed to create album' });
  }
});

// ============ MEDIA ITEM ENDPOINTS ============
// Get items in album
app.get('/api/albums/:albumId/items', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM "Media_Item" WHERE "AlbumID" = $1 AND "Post_Status" = $2',
      [req.params.albumId, 'Visible']
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching media items:', error);
    res.status(500).json({ error: 'Failed to fetch media items' });
  }
});

// Add media item
app.post('/api/albums/:albumId/items', async (req, res) => {
  const { uploadedByUserId, fileUrl, descriptionCaption, dateTaken } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO "Media_Item" ("AlbumID", "UploadedBy_UserID", "File_URL", "Description_Caption", "Date_Taken") VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.params.albumId, uploadedByUserId, fileUrl, descriptionCaption, dateTaken]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding media item:', error);
    res.status(500).json({ error: 'Failed to add media item' });
  }
});

// ============ MEMORIAL TRIBUTE ENDPOINTS ============
// Get tributes for a person
app.get('/api/people/:personId/tributes', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM "Memorial_Tribute" WHERE "Deceased_PersonID" = $1 AND "Post_Status" = $2 ORDER BY "Timestamp" DESC',
      [req.params.personId, 'Visible']
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tributes:', error);
    res.status(500).json({ error: 'Failed to fetch tributes' });
  }
});

// Add tribute
app.post('/api/people/:personId/tributes', async (req, res) => {
  const { postedByUserId, tributeContent } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO "Memorial_Tribute" ("Deceased_PersonID", "PostedBy_UserID", "Tribute_Content") VALUES ($1, $2, $3) RETURNING *',
      [req.params.personId, postedByUserId, tributeContent]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding tribute:', error);
    res.status(500).json({ error: 'Failed to add tribute' });
  }
});

// ============ GROUP ENDPOINTS ============
// Get all groups
app.get('/api/groups', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "Group"');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Create group
app.post('/api/groups', async (req, res) => {
  const { groupName, groupType, createdByUserId } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO "Group" ("GroupName", "GroupType", "CreatedBy_UserID") VALUES ($1, $2, $3) RETURNING *',
      [groupName, groupType, createdByUserId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Project Harmony API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
});
