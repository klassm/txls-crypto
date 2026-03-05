import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { DateTime } from "luxon";
import { typeOrmDateTimeTransformer } from "../../utils/typeorm-transformers.js";

@Entity("users")
export class UserEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", name: "name" })
  name!: string;

  @Column({ type: "varchar", unique: true, name: "username" })
  username!: string;

  @Column({ type: "varchar", name: "password" })
  password!: string;

  @Column({ type: "varchar", name: "salt" })
  salt!: string;

  @Column({ type: "varchar", name: "email" })
  email!: string;

  @Column({ type: "boolean", name: "is_admin", default: false })
  isAdmin!: boolean;

  @CreateDateColumn({
    name: "created_at",
    type: "bigint",
    transformer: typeOrmDateTimeTransformer,
  })
  createdAt!: DateTime;

  @UpdateDateColumn({
    name: "updated_at",
    type: "bigint",
    transformer: typeOrmDateTimeTransformer,
  })
  updatedAt!: DateTime;
}