import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPatient, listPatients } from "../api/patients";

export default function PatientsPage() {
  const queryClient = useQueryClient();
  const { data: patients = [], isLoading, isError } = useQuery({
    queryKey: ["patients"],
    queryFn: listPatients,
  });
  const [name, setName] = useState("");
  const [age, setAge] = useState("");

  const createMutation = useMutation({
    mutationFn: createPatient,
    onSuccess: () => {
      setName("");
      setAge("");
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Patients</h2>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate({
            name,
            age: age ? Number(age) : null,
          });
        }}
      >
        <div>
          <label className="block text-sm font-medium text-slate-700">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Age</label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Add patient
        </button>
        {createMutation.isError && (
          <p className="text-sm text-red-600">
            {createMutation.error instanceof Error ? createMutation.error.message : "Failed"}
          </p>
        )}
      </form>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-red-600">Could not load patients.</p>}

      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Age</th>
              <th className="px-4 py-2 font-medium">Gender</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">{p.age ?? "—"}</td>
                <td className="px-4 py-2">{p.gender ?? "—"}</td>
                <td className="px-4 py-2 text-slate-500">{new Date(p.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2 text-right">
                  <Link to={`/prescriptions?patient=${p.id}`} className="text-slate-700 underline">
                    New prescription
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}