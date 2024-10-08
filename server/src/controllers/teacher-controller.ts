import { Request, Response } from "express";
import Teacher from "../models/teacher";
import { getSchool, hashPassword, sendEmail, validate } from "../libs/utils";
import { createUserAndProfile } from "./profile-controller";
import {
  createBulkTeacherSchema,
  createTeacherSchema,
  updateTeacherSchema,
} from "../validation/teacher-schema";
import Subject from "../models/subject";
import Classroom from "../models/classroom";
import { DEFAULT_PAGE_LIMIT } from "../constants/variables";
import { ClientSession, startSession, Types } from "mongoose";
import Timetable, { IPeriod } from "../models/timetable";
import dayjs from "dayjs";
import AttendanceRecord from "../models/attendance-record";
import Student, { IStudent } from "../models/student";
import StudentAttendance from "../models/student-attendence";
import { asyncTransactionWrapper } from "../libs/async-transaction-wrapper";
import { CustomError } from "../libs/custom-error";
import User from "../models/user";

export const getAllTeachers = asyncTransactionWrapper(
  async (req: Request, res: Response) => {
    const {
      search,
      class: classroomId,
      page = 1,
      pageLimit = DEFAULT_PAGE_LIMIT,
      subject: subjectId,
      sf = "createdAt",
      so = "desc",
    } = req.query;

    const queryOptions: any = {
      school: req.user.profile.school,
      status: 1,
    };

    if (search) {
      queryOptions.name = { $regex: search, $options: "i" };
    }

    if (subjectId) {
      queryOptions.subject = new Types.ObjectId(subjectId as string);
    }

    const limit = Math.max(1, parseInt(pageLimit as string, 10));
    const skip = Math.max(0, (parseInt(page as string, 10) - 1) * limit);

    const sortOptions: any = {
      [sf.toString()]: so === "asc" ? 1 : -1,
    };

    const teachers = await Teacher.aggregate([
      { $match: queryOptions },
      {
        $lookup: {
          from: "classrooms",
          localField: "_id",
          foreignField: "mentor",
          as: "classroom",
        },
      },
      {
        $unwind: {
          path: "$classroom",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: classroomId
          ? { "classroom._id": new Types.ObjectId(classroomId as string) }
          : {},
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "subjects",
          localField: "subject",
          foreignField: "_id",
          as: "subject",
        },
      },
      {
        $unwind: {
          path: "$subject",
          preserveNullAndEmptyArrays: true,
        },
      },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: limit },
    ]);

    const totalTeachers = await Teacher.countDocuments(queryOptions);

    res.status(200).json({
      message: "Teachers fetched successfully",
      teachers,
      totalTeachers,
    });
  }
);

export const createTeacher = asyncTransactionWrapper(
  async (req: Request, res: Response, session: ClientSession) => {
    const validatedData = validate(createTeacherSchema, req.body, res);
    if (!validatedData) return;

    const { name, email, subject } = validatedData;

    const doesSubjectExist = await Subject.findOne({
      _id: subject,
      school: req.user.profile.school,
    }).session(session);

    if (!doesSubjectExist) {
      throw new CustomError(`${subject} doesn't exist`, 404);
    }

    const school = await getSchool(req);

    await createUserAndProfile({
      name,
      email,
      role: "teacher",
      school,
      subject,
      session,
    });

    res.status(201).json({
      message: "Teacher created successfully",
      showMessage: true,
    });
  }
);

export const createBulkTeachers = asyncTransactionWrapper(
  async (req: Request, res: Response, session: ClientSession) => {
    const validatedData = validate(createBulkTeacherSchema, req.body, res);
    if (!validatedData) return;

    const { teachers } = validatedData;

    const school = await getSchool(req);

    const emailData: {
      email: string;
      uniqueEmail: string;
      password: string;
    }[] = [];
    await Promise.all(
      teachers.map(
        async (teacher: { name: string; email: string; subject: string }) => {
          const { name, email, subject } = teacher;

          try {
            const doesSubjectExist = await Subject.findOne({
              name: subject,
              school: school._id,
            });

            if (!doesSubjectExist) {
              throw new CustomError(`${subject} doesn't exist`, 404);
            }

            const emailInfo = await createUserAndProfile({
              name,
              email,
              role: "teacher",
              school,
              subject: doesSubjectExist._id as string,
              session,
            });

            emailData.push(emailInfo);
          } catch (error: any) {
            console.log(error);
            throw new CustomError(
              `Error creating ${teacher?.name}: ${error.name}`,
              400
            );
          }
        }
      )
    );

    res.status(200).json({
      message: `Teachers created successfully`,
    });
  }
);

export const updateTeacher = asyncTransactionWrapper(
  async (req: Request, res: Response, session: ClientSession) => {
    const { teacherId } = req.params;

    if (!Types.ObjectId.isValid(teacherId))
      throw new CustomError("Invalid teacher ID", 400);

    const teacher = await Teacher.findOne({
      _id: teacherId,
      school: req.user.profile.school,
    });

    if (!teacher) {
      throw new CustomError("Teacher not found", 404);
    }

    const validatedData = validate(updateTeacherSchema, req.body, res);

    if (!validatedData) return;

    const { name, subject: subjectId, password } = validatedData;

    const subject = await Subject.findById(subjectId);

    if (!subject) {
      throw new CustomError("Subject not found", 404);
    }

    await teacher.updateOne({ name, subject }, { session });
    await teacher.save();

    if (password) {
      const hashedPassword = await hashPassword(password);
      await User.findByIdAndUpdate(
        teacher.user,
        { password: hashedPassword },
        { session }
      );
    }

    res
      .status(200)
      .json({ message: "Teacher updated successfully", showMessage: true });
  }
);

export const removeTeacherFromSchool = asyncTransactionWrapper(
  async (req: Request, res: Response, session: ClientSession) => {
    const { teacherId } = req.params;

    if (!Types.ObjectId.isValid(teacherId))
      throw new CustomError("Invalid teacher ID", 400);

    const teacher = await Teacher.findOne({
      _id: teacherId,
      school: req.user.profile._id,
    });

    if (!teacher) {
      throw new CustomError("Teacher not found", 404);
    }

    const classroom = await Classroom.findOne({ teacher: teacher._id });

    await classroom?.updateOne({ mentor: null }, { session });
    await teacher.updateOne({ status: 0 }, { session });

    await teacher.save({ session });
    await classroom?.save({ session });

    res
      .status(200)
      .json({ message: "Teacher removed successfully", showMessage: true });
  }
);

export const getMyClassroom = asyncTransactionWrapper(
  async (req: Request, res: Response) => {
    const classroom = await Classroom.findOne({
      mentor: req.user.profile._id,
    }).populate("mentor");

    res.status(200).json({ classroom });
  }
);

export const getMySchedule = asyncTransactionWrapper(
  async (req: Request, res: Response, session: ClientSession) => {
    const teacherId = req.user.profile._id as string;

    if (!Types.ObjectId.isValid(teacherId)) {
      return res.status(400).json({ error: "Invalid teacher ID" });
    }

    const timetables = await Timetable.find({ "periods.teacher": teacherId })
      .populate("classroom", "name")
      .populate("periods.teacher", "name")
      .populate("periods.subject", "name")
      .sort({ "periods.startTime": 1 })
      .session(session);

    const startOfWeek = dayjs().startOf("week").toDate();
    const endOfWeek = dayjs().endOf("week").toDate();

    const groupedByDay = await Promise.all(
      timetables.map(async (timetable) => {
        const { day, periods, classroom } = timetable;

        const sortedPeriods = periods.sort((a, b) => {
          const timeA = Date.parse(`1970-01-01T${a.startTime}:00Z`);
          const timeB = Date.parse(`1970-01-01T${b.startTime}:00Z`);
          return timeA - timeB;
        });

        const periodsWithAttendanceFlag = await Promise.all(
          sortedPeriods.map(async (period) => {
            const attendanceExists = await AttendanceRecord.exists({
              period: period._id,
              date: { $gte: startOfWeek, $lte: endOfWeek },
            }).session(session);

            return {
              ...period.toObject(),
              classroom,
              attendanceTaken: !!attendanceExists,
            };
          })
        );

        return { day, periods: periodsWithAttendanceFlag };
      })
    );

    const groupedSchedule = groupedByDay.reduce((acc, { day, periods }) => {
      if (!acc[day]) {
        acc[day] = [];
      }
      acc[day] = acc[day].concat(periods);
      return acc;
    }, {} as Record<string, IPeriod[]>);

    return res.json({ timetable: groupedSchedule });
  }
);

export const getMyAttendanceClasses = asyncTransactionWrapper(
  async (req: Request, res: Response) => {
    const teacherId = req.user.profile._id as string;

    if (!Types.ObjectId.isValid(teacherId)) {
      return res.status(400).json({ error: "Invalid teacher ID" });
    }

    const classrooms = await AttendanceRecord.aggregate([
      { $match: { mentor: new Types.ObjectId(teacherId) } },
      { $group: { _id: "$classroom" } },
      {
        $lookup: {
          from: "classrooms",
          localField: "_id",
          foreignField: "_id",
          as: "classroom",
        },
      },
      { $unwind: "$classroom" },
      {
        $project: {
          _id: 1,
          name: "$classroom.name",
        },
      },
    ]);

    res.json({ classrooms });
  }
);

export const getMySubjectAttendance = asyncTransactionWrapper(
  async (req: Request, res: Response) => {
    const { classroomId } = req.params;
    const {
      page = 1,
      limit = DEFAULT_PAGE_LIMIT,
      search,
      sf = "name",
      so = "asc",
    } = req.query;

    if (!Types.ObjectId.isValid(classroomId)) {
      throw new CustomError("Invalid ID", 400);
    }

    const queryOptions: any = {
      school: req.user.profile.school,
      status: 1,
    };

    const matchStage: any = { $match: { ...queryOptions } };

    if (search) {
      matchStage.$match.name = { $regex: search, $options: "i" };
    }

    const lookupClassroomAssociationStage: any = {
      $lookup: {
        from: "classroomstudentassociations",
        localField: "_id",
        foreignField: "student",
        as: "classroomAssociation",
      },
    };

    const unwindClassroomAssociationStage: any = {
      $unwind: {
        path: "$classroomAssociation",
        preserveNullAndEmptyArrays: true,
      },
    };

    const sortOptions: any = {};
    sortOptions[sf.toString()] = so === "asc" ? 1 : -1;

    const limitNumber =
      limit === "all" ? Infinity : Math.max(0, parseInt(limit as string, 10));
    const skip = Math.max(0, (parseInt(page as string, 10) - 1) * limitNumber);

    const paginationStage: any = {
      $facet: {
        paginatedResults: [{ $skip: skip }, { $limit: limitNumber }],
        totalCount: [{ $count: "count" }],
      },
    };

    const pipeline = [
      matchStage,
      lookupClassroomAssociationStage,
      unwindClassroomAssociationStage,
      {
        $match: {
          "classroomAssociation.classroom": new Types.ObjectId(classroomId),
        },
      },
      { $sort: sortOptions },
      paginationStage,
    ];

    const result = await Student.aggregate(pipeline);

    const students = result[0]?.paginatedResults || [];
    const totalCount = result[0]?.totalCount[0]?.count || 0;

    const attendanceRecords = await AttendanceRecord.find({
      classroom: classroomId,
      // @ts-ignore
      subject: req.user.profile.subject,
    });

    const attendanceRecordsId = attendanceRecords.map((record) => record._id);
    const totalClasses = attendanceRecords.length;

    const attendanceData = await Promise.all(
      students.map(async (student: IStudent) => {
        const studentPresentCount = await StudentAttendance.countDocuments({
          student: student._id,
          attendance: { $in: attendanceRecordsId },
          status: 1,
        });

        const percentage = totalClasses
          ? ((studentPresentCount / totalClasses) * 100).toFixed(2)
          : "0.00";

        return {
          name: student.name,
          roll: student.roll,
          presentCount: studentPresentCount,
          percentage,
        };
      })
    );

    res.status(200).json({
      message: "Subject attendance fetched successfully",
      attendanceData,
      totalClasses,
      totalItems: totalCount,
      currentPage: parseInt(page as string, 10),
      totalPages: Math.ceil(totalCount / limitNumber),
      classroom: classroomId,
    });
  }
);
