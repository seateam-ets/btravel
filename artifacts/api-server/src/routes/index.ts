import { Router, type IRouter } from "express";
import healthRouter from "./health";
import publicRouter from "./public";
import adminRequestsRouter from "./admin-requests";
import schedulingRouter from "./scheduling";
import tripsRouter from "./trips";
import billingRouter from "./billing";
import adminMiscRouter from "./admin-misc";
import dashboardRouter from "./dashboard";
import storageRouter from "./storage";
import { requireManager } from "../middlewares/requireManager";

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicRouter);

router.use("/admin", requireManager);
router.use("/admin", dashboardRouter);
router.use("/admin", adminRequestsRouter);
router.use("/admin", schedulingRouter);
router.use("/admin", tripsRouter);
router.use("/admin", billingRouter);
router.use("/admin", adminMiscRouter);

router.use(storageRouter);

export default router;
