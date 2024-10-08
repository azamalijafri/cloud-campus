import { Router } from "express";
import { authenticateUser } from "../middlewares/auth-middleware";
import { requireRole } from "../middlewares/role-middleware";
import {
  updateStudent,
  getAllStudent,
  getAllStudentByClass,
  kickStudentFromClass,
  removeStudentFromSchool,
  createStudent,
  createBulkStudents,
} from "../controllers/student-controller";

const router = Router();

router.use(authenticateUser);

router.post("/create/student", requireRole(["principal"]), createStudent);

router.post(
  "/create/bulk/students",
  requireRole(["principal"]),
  createBulkStudents
);

router.get("/get/all/students", requireRole(["principal"]), getAllStudent);

router.get(
  "/get/students/:classroomId",
  requireRole(["principal", "student", "teacher"]),
  getAllStudentByClass
);

router.put(
  "/update/student/:studentId",
  requireRole(["principal"]),
  updateStudent
);

router.put(
  "/kick/student",
  requireRole(["principal", "teacher"]),
  kickStudentFromClass
);

router.put(
  "/remove/student/:studentId",
  requireRole(["principal"]),
  removeStudentFromSchool
);

export default router;
