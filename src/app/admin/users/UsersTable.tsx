"use client";

import { User } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  IconButton,
  Chip,
  Box,
  Typography,
} from "@mui/material";
import { Edit, Key, Delete, Add as AddIcon } from "@mui/icons-material";
import { useState } from "react";
import { useDeleteUser } from "../../hooks/useAdminUsers";

interface UsersTableProps {
  users: User[];
  onEdit: (user: User) => void;
  onResetPassword: (user: User) => void;
  onDelete: (user: User) => void;
  onCreate: () => void;
  onDeleteConfirmed: () => void;
}

export default function UsersTable({
  users,
  onEdit,
  onResetPassword,
  onDelete,
  onCreate,
  onDeleteConfirmed,
}: UsersTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const deleteMutation = useDeleteUser();

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!userToDelete) return;

    deleteMutation.mutate(userToDelete.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setUserToDelete(null);
        onDeleteConfirmed();
      },
    });
  };

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onCreate}
        >
          Create User
        </Button>
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Username</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Admin</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Chip
                    label={user.isAdmin ? "Yes" : "No"}
                    color={user.isAdmin ? "primary" : "default"}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton onClick={() => onEdit(user)} size="small">
                    <Edit />
                  </IconButton>
                  <IconButton onClick={() => onResetPassword(user)} size="small">
                    <Key />
                  </IconButton>
                  <IconButton
                    onClick={() => handleDeleteClick(user)}
                    size="small"
                    color="error"
                  >
                    <Delete />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {deleteDialogOpen && userToDelete && (
        <Box sx={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(0,0,0,0.5)", zIndex: 1300 }}>
          <Paper sx={{ p: 3, maxWidth: 400, width: "90%" }}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6">Delete User</Typography>
              <Typography variant="body2" color="text.secondary">
                Are you sure you want to delete "{userToDelete.name}"? This
                action cannot be undone. All of the user's accounts and
                transactions will also be deleted.
              </Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
              <Button onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </Box>
          </Paper>
        </Box>
      )}
    </>
  );
}