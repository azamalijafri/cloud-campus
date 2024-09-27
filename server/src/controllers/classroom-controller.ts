import { Request, Response } from "express";
import Classroom from "../models/classroom";
import {
  assignStudentsSchema,
  assignTeacherSchema,
  createClassroomSchema,
} from "../validation/classroom-schema";
import { Types } from "mongoose";
import Teacher from "../models/teacher";
import Student from "../models/student";
import { getSchool, validate } from "../libs/utils";
import Subject from "../models/subject";
import { daysOfWeek } from "../constants/variables";
import Timetable from "../models/timetable";
import ClassroomStudentAssociation from "../models/classroom-student";
import ClassroomSubjectAssociation from "../models/classroom-subject";
import { asyncTransactionWrapper } from "../libs/async-transaction-wrapper";
import { CustomError } from "../libs/custom-error";

export const createClassroom = asyncTransactionWrapper(
  async (req: Request, res: Response, session) => {
    const validatedData = validate(createClassroomSchema, req.body, res);
    if (!validatedData) return;

    const { name, subjects } = validatedData;
    const school = await getSchool(req);

    const existingClassroom = await Classroom.findOne({
      name,
      school: school._id,
      status: 1,
    }).session(session);

    if (existingClassroom) {
      throw new CustomError("Classroom with this name already exist", 409);
    }

    const classroom = await Classroom.create([{ name, school: school._id }], {
      session,
    });

    const classroomSubjects = subjects.map((subject: Types.ObjectId) => ({
      classroom: classroom[0]._id,
      subject,
    }));

    await ClassroomSubjectAssociation.insertMany(classroomSubjects, {
      session,
    });

    const timetabledays = daysOfWeek.map((day) => ({
      day,
      classroom: classroom[0]._id,
      periods: [],
    }));

    await Timetable.insertMany(timetabledays, { session });

    return res.status(201).json({
      message: "Classroom created successfully",
      classroom: classroom[0],
      showMessage: true,
    });
  }
);

export const assignTeacherToClassroom = asyncTransactionWrapper(
  async (req: Request, res: Response, session) => {
    const validatedData = validate(assignTeacherSchema, req.body, res);
    if (!validatedData) return;

    const { teacherId, classroomId } = validatedData;

    const teacher = await Teacher.findById(teacherId).session(session);
    if (!teacher) {
      throw new CustomError("Teacher not found", 404);
    }

    const existingClassroom = await Classroom.findOne({
      teacher: teacherId,
    }).session(session);

    if (existingClassroom) {
      throw new CustomError("Teacher is already assigned to a classroom", 400);
    }

    const classroom = await Classroom.findById(classroomId).session(session);
    if (!classroom) {
      throw new CustomError("Classroom not found", 404);
    }

    classroom.mentor = teacherId;
    await classroom.save({ session });

    return res.status(200).json({
      message: "Teacher assigned to classroom successfully",
      classroom,
      showMessage: true,
    });
  }
);

export const assignStudentsToClassroom = asyncTransactionWrapper(
  async (req: Request, res: Response, session) => {
    const validatedData = validate(assignStudentsSchema, req.body, res);
    if (!validatedData) return;

    const { studentsIds, classroomId } = validatedData;

    const classroom = await Classroom.findById(classroomId).session(session);
    if (!classroom) {
      throw new CustomError("Classroom not found", 404);
    }

    const students = await Student.find({ _id: { $in: studentsIds } }).session(
      session
    );

    if (students.length !== studentsIds.length) {
      throw new CustomError("Some students not found", 404);
    }

    const classroomStudentAssociations = students.map((student) => ({
      student: student._id,
      classroom: classroomId,
    }));

    await ClassroomStudentAssociation.insertMany(classroomStudentAssociations, {
      session,
    });

    res.status(200).json({
      message: "Students successfully assigned to classroom",
      showMessage: true,
    });
  }
);

export const getAllClassrooms = asyncTransactionWrapper(
  async (req: Request, res: Response) => {
    const classrooms = await Classroom.find({
      school: req.user.profile.school,
      status: 1,
    }).populate("mentor");

    res.status(200).json({
      message: "Classrooms fetched successfully",
      classrooms,
    });
  }
);

export const getClassroomSubjects = asyncTransactionWrapper(
  async (req: Request, res: Response) => {
    const { classroomId } = req.params;

    const classroom = await Classroom.findById(classroomId);
    if (!classroom) throw new CustomError("Classroom not found", 404);

    const classroomSubjects = await ClassroomSubjectAssociation.find({
      classroom: classroom._id,
    });

    const subjectPromises = classroomSubjects.map(async (sub) => {
      return await Subject.findById(sub.subject);
    });

    const subjects = await Promise.all(subjectPromises);

    res.status(200).json({
      message: "Classroom subjects fetched successfully",
      subjects,
    });
  }
);

export const getClassroomDetails = asyncTransactionWrapper(
  async (req: Request, res: Response) => {
    const { classroomId } = req.params;

    const classroom = await Classroom.findById(classroomId).populate("mentor");

    if (!classroom) {
      throw new CustomError("Classroom not found", 404);
    }

    res.status(200).json({
      message: "Classroom details fetched successfully",
      classroom,
    });
  }
);

export const deleteClassroom = asyncTransactionWrapper(
  async (req: Request, res: Response) => {
    const { classroomId } = req.params;

    const classroom = await Classroom.findById(classroomId);

    if (!classroom) {
      throw new CustomError("Classroom not found", 404);
    }

    await Classroom.findByIdAndUpdate(classroom._id, {
      status: 0,
      mentor: null,
    });

    res.status(200).json({
      message: "Classroom deleted successfully",
      showMessage: true,
    });
  }
);

export const updateClassroom = asyncTransactionWrapper(
  async (req: Request, res: Response, session) => {
    const { classroomId } = req.params;

    const validatedData = validate(createClassroomSchema, req.body, res);
    if (!validatedData) return;

    const { name, subjects } = validatedData;

    const existingClassroomWithSameNamePromise = Classroom.findOne({
      name,
      school: req.user.profile.school,
      _id: { $ne: classroomId },
      status: 1,
    }).session(session);

    const existingClassroomPromise =
      Classroom.findById(classroomId).session(session);

    const [existingClassroomWithSameName, existingClassroom] =
      await Promise.all([
        existingClassroomWithSameNamePromise,
        existingClassroomPromise,
      ]);

    if (existingClassroomWithSameName) {
      throw new CustomError("Classroom with this name already present", 409);
    }

    if (!existingClassroom) {
      throw new CustomError("Classroom not found", 404);
    }

    if (subjects && subjects.length > 0) {
      await ClassroomSubjectAssociation.deleteMany({
        classroom: classroomId,
      }).session(session);

      const classroomSubjects = subjects.map((subject: Types.ObjectId) => ({
        classroom: classroomId,
        subject,
      }));

      await ClassroomSubjectAssociation.insertMany(classroomSubjects, {
        session,
      });
    }

    existingClassroom.name = name;
    await existingClassroom.save({ session });

    return res
      .status(200)
      .json({ message: "Classroom updated successfully", showMessage: true });
  }
);
