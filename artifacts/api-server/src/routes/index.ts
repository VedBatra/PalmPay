import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import walletRouter from "./wallet.js";
import merchantsRouter from "./merchants.js";
import adminRouter from "./admin.js";
import hardwareRouter from "./hardware.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(walletRouter);
router.use(merchantsRouter);
router.use(adminRouter);
router.use(hardwareRouter);

export default router;
