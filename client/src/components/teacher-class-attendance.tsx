import { apiUrls } from "@/constants/api-urls";
import { useFetchData } from "@/hooks/useFetchData";
import { useLocation, useParams } from "react-router-dom";
import StudentsAttendanceTable from "./students-attendance-table";
import queryString from "query-string";

const TeacherClassAttendance = () => {
  const { classId } = useParams();
  const location = useLocation();

  const { page = 1 } = Object.fromEntries(
    new URLSearchParams(location.search).entries()
  );

  const apiUrl = queryString.stringifyUrl(
    {
      url: `${apiUrls.teacher.getMySubjectAttendance}/${classId}`,
      query: {
        page,
      },
    },
    { skipEmptyString: true, skipNull: true }
  );

  const { data, isLoading } = useFetchData(
    ["teacher-subject-attendance", String(classId), page.toString()],
    apiUrl
  );

  if (isLoading) return null;
  return (
    <div className="p-4 space-y-4">
      <span className="font-medium underline underline-offset-4">
        {data?.classroom?.name}'s Attendance Data
      </span>
      <StudentsAttendanceTable
        data={data?.attendanceData}
        totalClasses={data?.totalClasses}
        totalItems={data?.totalItems}
      />
    </div>
  );
};

export default TeacherClassAttendance;
