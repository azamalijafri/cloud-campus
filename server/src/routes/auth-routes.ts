import { Router } from "express";
import { login } from "../controllers/auth-controller";
import { registerPrincipal } from "../controllers/school-controller";

const router = Router();

router.post("/login", login);
router.post("/register", registerPrincipal);

export default router;
