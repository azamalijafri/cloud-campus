import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useFetchData } from "@/hooks/useFetchData";
import DataTable from "@/components/data-table";
import { apiUrls } from "@/constants/api-urls";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useModal } from "@/stores/modal-store";
import axiosInstance from "@/lib/axios-instance";
import queryString from "query-string";
import { useQueryClient } from "@tanstack/react-query";

const AllStudentsList = ({ queryKey }: { queryKey: string }) => {
  const location = useLocation();

  const {
    search,
    class: classFilter,
    page = 1,
    sf,
    so,
  } = Object.fromEntries(new URLSearchParams(location.search).entries());

  const apiUrl = queryString.stringifyUrl(
    {
      url: apiUrls.student.getAllStudents,
      query: {
        search,
        class: classFilter,
        page,
        sf,
        so,
      },
    },
    { skipEmptyString: true, skipNull: true }
  );

  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const { data = [], refetch } = useFetchData({
    queryKey: [queryKey, "students"],
    apiUrl,
  });

  const queryClient = useQueryClient();
  useEffect(() => {
    (async () => {
      const response = await axiosInstance.get(apiUrl);
      queryClient.setQueryData([queryKey, "students"], response.data);
    })();
  }, [search, classFilter, page, sf, so, apiUrl, queryClient, queryKey]);

  const { openModal } = useModal();

  const toggleSelectStudent = (studentId: string) => {
    setSelectedStudents((prevSelected) =>
      prevSelected.includes(studentId)
        ? prevSelected.filter((id) => id !== studentId)
        : [...prevSelected, studentId]
    );
  };

  const handleAssign = () => {
    openModal("assign-students", { selectedStudents });
  };

  const columns = [
    {
      label: "Select",
      render: (student: IStudent) => (
        <Checkbox
          checked={selectedStudents.includes(student._id)}
          onClick={() => toggleSelectStudent(student._id)}
        />
      ),
      value: "select",
      colspan: 0,
    },
    {
      label: "Name",
      render: (student: IStudent) => student?.name,
      value: "name",
      colspan: 2,
    },
    {
      label: "Email",
      render: (student: IStudent) => student?.user?.email,
      value: "email",
      colspan: 2,
    },
    {
      label: "Class",
      render: (student: IStudent) => student?.classroom?.name ?? "Not Assigned",
      value: "classroom",
      colspan: 2,
    },
    {
      label: "Roll No",
      render: (student: IStudent) => student?.roll,
      value: "roll",
      colspan: 1,
    },
  ];

  const actions = (student: IStudent) => (
    <div className="flex space-x-2">
      <Button
        variant="default"
        onClick={() => {
          openModal("upsert-student", { student: student });
        }}
      >
        Edit
      </Button>
      <Button
        variant="destructive"
        onClick={() => {
          openModal("confirm", {
            performingAction: async () => {
              const response = await axiosInstance.put(
                `${apiUrls.student.removeStudentFromSchool}/${student._id}`
              );

              if (response) refetch();
            },
          });
        }}
      >
        Remove
      </Button>
    </div>
  );

  return (
    <div className="p-4 flex flex-col space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium text-xl underline underline-offset-4">
          All Students
        </h3>
        <Button
          variant="default"
          onClick={handleAssign}
          disabled={selectedStudents.length === 0}
        >
          Assign Class
        </Button>
      </div>

      <DataTable
        gridValue="10"
        data={data?.students}
        columns={columns}
        actions={actions}
        totalItems={data?.totalStudents}
        classFilter={true}
      />
    </div>
  );
};

export default AllStudentsList;
