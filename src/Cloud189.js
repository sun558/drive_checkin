require("dotenv").config();
const recording = require("log4js/lib/appenders/recording");
const { CloudClient, FileTokenStore } = require("../sdk/index");
let { push } = require("./push");

const { logger } = require("./logger");

const sleep = async (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const mask = (s, start, end) => {
  if (s == null) process.exit(0);
  return s.split("").fill("*", start, end).join("");
};

let timeout = 10000;
let accountIndex = 1;  //家庭序号
let firstUserName;

const originalLog = (message) => {
    logger.log(message);
  };

const doTask = async (cloudClient,acquireFamilyTotalSize,errorMessages,userNameInfo) => {
  let result = [];
  let signPromises1 = [];
  let getSpace = [`${firstSpace}个人获得(M)`];

  if (process.env.PRIVATE_ONLY_FIRST != "true" || i == 1) {
    for (let m = 0; m < process.env.PRIVATE_THREADX; m++) {
      signPromises1.push(
        (async () => {
          try {
            const res1 = await cloudClient.userSign();
            if (!res1.isSign) {
              getSpace.push(` ${res1.netdiskBonus}`);
            }
          } catch (e) {
			  errorMessages.push(`${accountIndex}. 账号 ${userNameInfo} 错误: 个人未能签到`);
		  }
        })()
      );
    }
    //超时中断
    await Promise.race([Promise.all(signPromises1), sleep(timeout)]);
    if (getSpace.length == 1) getSpace.push(" 0");
    result.push(getSpace.join(""));
  }

  signPromises1 = [];
  getSpace = [`${firstSpace}家庭获得(M)`];
  const { familyInfoResp } = await cloudClient.getFamilyList();
  if (!familyInfoResp) {
	  errorMessages.push(`${accountIndex}. 账号 ${userNameInfo} 错误: 未能获取家庭信息`)
      return result;
    }
 
    const family = familyInfoResp.find((f) => f.familyId == FAMILY_ID);
    if (!family) {
		errorMessages.push(`${accountIndex}. 账号 ${userNameInfo} 错误: 没有加入指定家庭组`);
		return result;
	};
    // result.push(`${firstSpace}开始签到家庭云 ID: ${family.familyId}`);
    for (let i = 0; i < 1; i++) {
      signPromises1.push(
        (async () => {
          try {
            const res = await cloudClient.familyUserSign(family.familyId);
            if (!res.signStatus) {
              getSpace.push(` ${res.bonusSpace}`);
			   acquireFamilyTotalSize.push(` ${res.bonusSpace}`);
            }
          } catch (e) {
			  errorMessages.push(`${accountIndex}. 账号 ${userNameInfo} 错误: 家庭未能签到`);
		  }
        })()
      );
    }
    //超时中断
    await Promise.race([Promise.all(signPromises1), sleep(timeout)]);

    if (getSpace.length == 1) getSpace.push(" 0");
    result.push(getSpace.join(""));
  
  return result;
};

let firstSpace = "  ";

if (process.env.TYYS == null || process.env.TYYS == "") {
  logger.error("没有设置TYYS环境变量");
  process.exit(0);
}

let accounts_group = process.env.TYYS 
  ? process.env.TYYS
      .split('\n')          // 按行分割
      .map(line => line.trim()) // 去除每行首尾空格
      .filter(Boolean)      // 移除空行
  : "";
let FAMILY_ID;

let i;

let cloudClientMap = new Map();
let cloudClient = null;
let userNameInfo;

const fs = require("fs");
const path = require("path");

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// 使用示例
const folderPath = path.join(process.cwd(), ".token");
ensureDirectoryExists(folderPath);

const main = async () => {
  let accounts;
  const errorMessages = [];
  const acquireFamilyTotalSize = [];  //获得家庭总量
 
  
    accounts = accounts_group.flatMap(line => {
		return line
			.split(/\s+/) // 按任意空白符分割
			.filter(item => item.length > 0) // 防止空字符串
		});
	  
    let familyCapacitySize, familyCapacitySize2, userSizeInfoInitial;
    FAMILY_ID = accounts[0];

    for (i = 1; i < accounts.length; i += 2) {
      const [userName, password] = accounts.slice(i, i + 2);

      userNameInfo = mask(userName, 3, 7);
      let token = new FileTokenStore(`.token/${userName}.json`);
      try {
        await sleep(2000);
        cloudClient = new CloudClient({
          username: userName,
          password,
          token: token,
        });
      } catch (e) {
        console.error("操作失败:", e.message); // 只记录错误消息
		errorMessages.push( `${accountIndex}. 账号 ${userNameInfo} 错误: ${
		typeof e === "string" ? e : e.message || "未知错误"
		}`);
      }

      cloudClientMap.set(userName, cloudClient);
      try {
        console.log(`${(i - 1) / 2 + 1}.账户 ${userNameInfo} 开始执行`);

        let {
          cloudCapacityInfo: cloudCapacityInfo0,
          familyCapacityInfo: familyCapacityInfo0,
        } = await cloudClient.getUserSizeInfo();
		
		if(i==1){
			userSizeInfoInitial = await cloudClient.getUserSizeInfo();
		}

        const result = await doTask(cloudClient,acquireFamilyTotalSize,errorMessages,userNameInfo);
        result.forEach((r) => console.log(r));

        let {
          cloudCapacityInfo: cloudCapacityInfo2,
          familyCapacityInfo: familyCapacityInfo2,
        } = await cloudClient.getUserSizeInfo();

        if (i == 1) {
          firstUserName = userName;
		  
          familyCapacitySize = familyCapacityInfo0.totalSize;
          familyCapacitySize2 = familyCapacitySize;
        }

        //重新获取主账号的空间信息
        cloudClient = cloudClientMap.get(firstUserName);
        const { familyCapacityInfo } = await cloudClient.getUserSizeInfo();

        console.log(
          `${firstSpace}实际：个人容量+ ${
            (cloudCapacityInfo2.totalSize - cloudCapacityInfo0.totalSize) /
            1024 /
            1024
          }M, 家庭容量+ ${
            (familyCapacityInfo.totalSize - familyCapacitySize2) / 1024 / 1024
          }M`
        );
        console.log(
          `${firstSpace}个人总容量：${(
            cloudCapacityInfo2.totalSize /
            1024 /
            1024 /
            1024
          ).toFixed(2)}G, 家庭总容量：${(
            familyCapacityInfo2.totalSize /
            1024 /
            1024 /
            1024
          ).toFixed(2)}G`
        );
        familyCapacitySize2 = familyCapacityInfo.totalSize;
      } catch (e) {
        console.error(e);
		errorMessages.push( `${accountIndex}. 账号 ${userNameInfo} 错误: ${
			typeof e === "string" ? e : e.message || "未知错误"
		}`);
        if (e.code === "ETIMEDOUT") throw e;
      } finally {
        console.log(" ");
		accountIndex++;
      }
    }
	accountIndex--;

  
    userNameInfo = mask(firstUserName, 3, 7);
    const capacityChange = familyCapacitySize2 - familyCapacitySize;
   

    cloudClient = cloudClientMap.get(firstUserName);
    let {
      cloudCapacityInfo: cloudCapacityInfo2,
      familyCapacityInfo: familyCapacityInfo2,
    } = await cloudClient.getUserSizeInfo();
	logger.log(
      `主账号 ${userNameInfo}:`
    );
	logger.log(`前 个人：${ (
				(userSizeInfoInitial.cloudCapacityInfo.totalSize) /
				1024 /
				1024 /
				1024
			).toFixed(2)}G, 家庭：${(
				( userSizeInfoInitial.familyCapacityInfo.totalSize) /
				1024 /
				1024 /
				1024
			).toFixed(2)}G`);
    logger.log(
      `后 个人：${(
        cloudCapacityInfo2.totalSize /
        1024 /
        1024 /
        1024
      ).toFixed(2)}G, 家庭：${(
        familyCapacityInfo2.totalSize /
        1024 /
        1024 /
        1024
      ).toFixed(2)}G`
    );
	 logger.log(
      `个人容量 +${((cloudCapacityInfo2.totalSize - userSizeInfoInitial.cloudCapacityInfo.totalSize)/
				1024 /
				1024 
			).toFixed(0)}M 家庭容量 +${(capacityChange / 1024 / 1024/1024).toFixed(2)}G 签到 ${acquireFamilyTotalSize.length}/${accountIndex}次             `
    );
    logger.log("");
  
  	 // 错误信息
  if (errorMessages.length > 0) {
    originalLog(' ');
    originalLog('错误信息'+errorMessages.length+'个: ');
    errorMessages.forEach(msg => originalLog(msg));
  }
 
};

(async () => {
  try {
    await main();
  } finally {
    logger.log("\n\n");
    const events = recording.replay();
    const content = events.map((e) => `${e.data.join("")}`).join("  \n");
	const userNameInfo =  mask(firstUserName, 3, 7).slice(7, 12);
	const target = ["家庭容量"];
	const targetIndex = content.indexOf(target);
	const startIndex = targetIndex + target.length;
	const contentDel = content.substring(startIndex+1, startIndex + 30);
    push(`${userNameInfo}天翼家庭${contentDel}`,  content);
  }
})();
