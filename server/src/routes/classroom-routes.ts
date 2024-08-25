import { Router } from "express";
import { authenticateUser } from "../middlewares/auth-middleware";
import { requireRole } from "../middlewares/role-middleware";
import {
  assignStudentToClassroom,
  assignTeacherToClassroom,
  createClassroom,
  deleteClassroom,
  getAllClassrooms,
  getClassroomDays,
  getClassroomDetails,
  updateClassroom,
} from "../controllers/classroom-controller";

const router = Router();

router.use(authenticateUser);

router.post("/create/classroom", requireRole(["principal"]), createClassroom);

router.post(
  "/assign/teacher",
  requireRole(["principal"]),
  assignTeacherToClassroom
);

router.post(
  "/assign/student",
  requireRole(["principal", "teacher"]),
  assignStudentToClassroom
);

router.get("/get/all/classrooms", requireRole(["principal"]), getAllClassrooms);

router.get("/get/classroom/details/:classId", getClassroomDetails);

router.get("/get/classroom/days/:classId", getClassroomDays);

router.delete("/remove/classroom/:classId", deleteClassroom);

router.put("/update/classroom/:classId", updateClassroom);

export default router;
