"use client";

import { Typography, Box } from "@mui/material";
import { useState } from "react";
import { User } from "@txls/shared/client";
import { useAuth } from "../../contexts/AuthContext";
import { useAdminUsers } from "../../hooks/useAdminUsers";
import { PageLayout } from "../../components/common/PageLayout";
import UsersTable from "./UsersTable";
import CreateUserDialog from "./CreateUserDialog";
import EditUserDialog from "./EditUserDialog";
import ResetPasswordDialog from "./ResetPasswordDialog";

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  const { data: users } = useAdminUsers();

  if (!user?.isAdmin) {
    return (
      <PageLayout maxWidth="lg">
        <Typography variant="h6" color="error">
          Access Denied. Admin privileges required.
        </Typography>
      </PageLayout>
    );
  }

  return (
    <PageLayout maxWidth="lg">
      <Typography variant="h4" gutterBottom>
        User Management
      </Typography>
      <Box sx={{ mb: 2 }}>
        <UsersTable
          users={users || []}
          onEdit={(user) => {
            setSelectedUser(user);
            setEditDialogOpen(true);
          }}
          onResetPassword={(user) => {
            setSelectedUser(user);
            setPasswordDialogOpen(true);
          }}
          onDelete={(user) => {
            setSelectedUser(user);
          }}
          onCreate={() => setCreateDialogOpen(true)}
          onDeleteConfirmed={() => {
            setSelectedUser(null);
          }}
        />
      </Box>
      <CreateUserDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={() => {
          setCreateDialogOpen(false);
        }}
      />
      <EditUserDialog
        open={editDialogOpen}
        user={selectedUser}
        onClose={() => {
          setEditDialogOpen(false);
          setSelectedUser(null);
        }}
        onSuccess={() => {
          setEditDialogOpen(false);
          setSelectedUser(null);
        }}
      />
      <ResetPasswordDialog
        open={passwordDialogOpen}
        user={selectedUser}
        onClose={() => {
          setPasswordDialogOpen(false);
          setSelectedUser(null);
        }}
        onSuccess={() => {
          setPasswordDialogOpen(false);
          setSelectedUser(null);
        }}
      />
    </PageLayout>
  );
}