const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

// middleWare

// const authenticateToken = (request, response, next) => {
//   let jwtToken;
//   const authHeader = request.headers["authorization"];
//   if (authHeader !== undefined) {
//     jwtToken = authHeader.split(" ")[1];
//   }
//   if (jwtToken === undefined) {
//     response.status(401);
//     response.send("Invalid JWT Token");
//   } else {
//     jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
//       if (error) {
//         response.status(401);
//         response.send("Invalid JWT Token");
//       } else {
//         request.username = payload.username;
//         next();
//       }
//     });
//   }
// };

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// post  /register/

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const createUserQuery = `
        INSERT INTO
          user (username, name, password, gender)
        VALUES
          (
            '${username}',
            '${name}',
            '${hashedPassword}',
            '${gender}'

          )`;
    await db.run(createUserQuery);

    response.send(`User created successfully`);
  }
});

// post /login/

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// get /user/tweets/feed/

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}'`;

  const dbUser = await db.get(selectUserQuery);
  const followersListQuery = `SELECT following_user_id FROM follower WHERE follower_user_id= ${dbUser.user_id}`;
  const followerList = await db.all(followersListQuery);

  const ListOfFollowers = followerList.map(
    (eachFollower) => eachFollower.following_user_id
  );

  const getTweetsQuery = `
      SELECT
       username,
        tweet,
        date_time as dateTime
      FROM
       tweet INNER JOIN user ON tweet.user_id = user.user_id
      WHERE
      tweet.user_id in (${ListOfFollowers})
       ORDER BY date_time DESC
      LIMIT 4;`;
  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

// get /user/following/

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getTweetsQuery = `
  select name from user where user_id in (select following_user_id from user inner join follower on user.user_id = follower.follower_user_id where username = '${username}')`;

  const follows_name = await db.all(getTweetsQuery);
  response.send(follows_name);
});

// get  /user/followers/
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getTweetsQuery = `
    select name from user where user_id in (select follower_user_id from user inner join follower on user.user_id = follower.following_user_id where username = '${username}')`;
  const follows_name = await db.all(getTweetsQuery);
  response.send(follows_name);
});

// get /tweets/:tweetId/

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  let { username } = request;
  const { tweetId } = request.params;
  const getTweetsQuery = `
    select count(DISTINCT t.reply_id)replies,count(DISTINCT like.like_id )as likes, t.tweet as tweet,tweet.date_time as dateTime from (reply left join tweet on reply.tweet_id = tweet.tweet_id)as t left join like on t.tweet_id=like.tweet_id where tweet.tweet_id=${tweetId}`;
  const tweet = await db.get(getTweetsQuery);
  const followersQuery = `
 SELECT * FROM follower INNER JOIN user ON user.user_id = follower.following_user_id WHERE username = '${username}'`;
  const followers = await db.all(followersQuery);
  const tweetDetailsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId}`;
  const tweetDetails = await db.get(tweetDetailsQuery);

  if (
    followers.some((item) => item.follower_user_id === tweetDetails.user_id)
  ) {
    response.send(tweet);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// get /tweets/:tweetId/likes/

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const followersQuery = `
 SELECT * FROM follower INNER JOIN user ON user.user_id = follower.following_user_id WHERE username = '${username}'`;
    const followers = await db.all(followersQuery);
    const tweetDetailsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId}`;
    const tweetDetails = await db.get(tweetDetailsQuery);

    if (
      followers.some((item) => item.follower_user_id === tweetDetails.user_id)
    ) {
      const likesQuery = `SELECT username from like INNER JOIN user ON user.user_id = like.user_id WHERE tweet_id=${tweetId}`;
      const likeUser = await db.all(likesQuery);
      const likesList = likeUser.map((eachUser) => eachUser.username);
      response.send({ likes: likesList });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// get /tweets/:tweetId/replies/
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const followersQuery = `
 SELECT * FROM follower INNER JOIN user ON user.user_id = follower.following_user_id WHERE username = '${username}'`;
    const followers = await db.all(followersQuery);
    const tweetDetailsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId}`;
    const tweetDetails = await db.get(tweetDetailsQuery);

    if (
      followers.some((item) => item.follower_user_id === tweetDetails.user_id)
    ) {
      const replyQuery = `SELECT name,reply from reply INNER JOIN user ON user.user_id = reply.user_id WHERE tweet_id=${tweetId}`;
      const replyDetails = await db.all(replyQuery);
      response.send({ replies: replyDetails });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// get  /user/tweets/

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const userQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
  const userId = await db.get(userQuery);

  const getTweetsQuery = `
      select * FROM tweet WHERE user_id=${userId.user_id}`;
  const tweet = await db.all(getTweetsQuery);
  userTweetList = [];
  for (let eachTweet of tweet) {
    const likesQuery = `SELECT count(like_id) as likesCount FROM like WHERE tweet_id=${eachTweet.tweet_id}`;
    const likesCount = await db.all(likesQuery);
    const replyQuery = `SELECT count(reply_id) as repliesCount FROM reply WHERE tweet_id=${eachTweet.tweet_id}`;
    const replyCount = await db.all(replyQuery);
    userTweetList.push({
      tweet: eachTweet.tweet,
      replies: replyCount[0].repliesCount,
      likes: likesCount[0].likesCount,
      dateTime: eachTweet.date_time,
    });
  }
  response.send(userTweetList);
});

// post /user/tweets/

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const tweetDetails = request.body;
  const { tweet } = tweetDetails;
  const userQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const userId = await db.get(userQuery);
  const createTweet = `INSERT INTO tweet (tweet,user_id)
  VALUES('${tweet}',${userId.user_id})`;
  await db.run(createTweet);
  response.send("Created a Tweet");
});

// delete /tweets/:tweetId/

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const tweetIdQuery = `SELECT tweet_id FROM tweet WHERE user_id = (SELECT user_id FROM user WHERE username='${username}')`;
    const tweetIdList = await db.all(tweetIdQuery);
    if (tweetIdList.some((eachTweet) => eachTweet.tweet_id == tweetId)) {
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId}`;
      await db.all(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
